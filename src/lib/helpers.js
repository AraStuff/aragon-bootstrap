const Ethers = require('ethers');
const Ora = require('ora');
const RLP = require('rlp');
const { keccak256 } = require('web3-utils');
const { connect } = require('@aragon/connect');
const { encodeActCall, execAppMethod } = require('mathew-aragon-toolkit');
const { encodeCallScript } = require('@aragon/test-helpers/evmScript');
const {
    setIntervalAsync,
    clearIntervalAsync
} = require('set-interval-async/fixed');

const {
    COMPANY_TEMPLATE_ADDRESS,
    MINIME_FACTORY_ADDRESS
} = require('./factoryAddresses');

const {
    vaultInitSignature,
    tokenManagerInitSignature,
    delayInitSignature,
    tokenRequestInitSignature,
    redemptionsInitSignature,
    newAppInstanceSignature,
    createPermissionSignature,
    newTokenAndInstance
} = require('./signatures');

const {
    vaultAppId,
    vaultBase,
    delayAppId,
    delayBase,
    tokenManagerAppId,
    tokenManagerBase,
    tokenRequestAppId,
    tokenRequestBase,
    redemptionsAppId,
    redemptionsBase
} = require('./apm');

const {
    community_dao,
    ZERO_ADDRESS,
    network,
    tokenName,
    symbol,
    daoId,
    holders,
    balances,
    voteSettings
} = require('../daoSettings');

const { companyTemplateAbi, minimeAbi, minimeBytecode } = require('./abis');

async function getDaoAddress(
    selectedFilter,
    templateContract,
    transactionHash
) {
    return new Promise((resolve, reject) => {
        const desiredFilter = templateContract.filters[selectedFilter]();

        templateContract.on(desiredFilter, (contractAddress, event) => {
            if (event.transactionHash === transactionHash) {
                resolve(contractAddress);
            }
        });
    });
}

async function buildNonceForAddress(_address, _index, provider) {
    const txCount = await provider.getTransactionCount(_address);
    return `0x${(txCount + _index).toString(16)}`;
}
function calculateNewProxyAddress(_daoAddress, _nonce) {
    const rlpEncoded = RLP.encode([_daoAddress, _nonce]);
    const contractAddressLong = keccak256(rlpEncoded);
    const contractAddress = `0x${contractAddressLong.substr(-40)}`;

    return contractAddress;
}

async function counterfactualAddress(_address, _index, network) {
    const provider = Ethers.getDefaultProvider(network);
    const nonce = await buildNonceForAddress(_address, _index, provider);
    return calculateNewProxyAddress(_address, nonce);
}

async function encodeContractInteraction(contract, signature, params) {
    const data = await encodeActCall(signature, params);
    return {
        to: contract,
        calldata: data
    };
}

async function connectDAO(dao, network) {
    const spinner = Ora(`waiting 180 seconds for DAO to be indexed`).start();
    const p = new Promise(async (resolve, reject) => {
        let timer = 120;
        let org;
        const timeout = setIntervalAsync(async () => {
            timer = timer - 1;
            spinner.text = `waiting ${timer} seconds for DAO to be indexed`;
            if (timer === 0) {
                org = await connect(dao, 'thegraph', { network: network });
                //console.log(org);
                clearIntervalAsync(timeout);
                spinner.succeed('Apps Fetched');
                resolve(org);
            }
        }, 1000);
    });

    const result = await p;
    return result;
}

async function getApps(dao) {
    const apps = await dao.apps();
    const permissions = await dao.permissions();
    const acl = permissions.filter(
        (p) =>
            p.roleHash ===
            `0x0b719b33c83b8e5d300c521cb8b54ae9bd933996a14bef8c2f4e0285d2d2400a`
    )[0].appAddress;

    return {
        token_manager: apps.find((app) => app.name === 'token-manager').address,
        voting: apps.find((app) => app.name === 'voting').address,
        agent: apps.find((app) => app.name === 'agent').address,
        finance: apps.find((app) => app.name === 'finance').address,
        acl: acl
    };
}

async function installScript(
    fdaiAddress,
    daiAddress,
    fdaiManagerAddress,
    fdaiVaultAddress,
    delayAddress,
    tokenrequestAddress,
    redemptionsAddress,
    voting,
    dao,
    acl,
    network
) {
    const bootstrapSpinner = Ora('bootstrap _Prtcl Apps\n').start();
    const vaultInitPayload = await encodeActCall(vaultInitSignature, []);
    const fdai_managerInitPayload = await encodeActCall(
        tokenManagerInitSignature,
        [fdaiAddress, true, 0]
    );
    const delayInitPayload = await encodeActCall(delayInitSignature, [1000]);
    const token_requestInitPayload = await encodeActCall(
        tokenRequestInitSignature,
        [fdaiManagerAddress, fdaiVaultAddress, [daiAddress]]
    );
    const redemptionsInitPayload = await encodeActCall(
        redemptionsInitSignature,
        [fdaiVaultAddress, fdaiManagerAddress, [daiAddress]]
    );

    const actions = await Promise.all([
        encodeContractInteraction(dao, newAppInstanceSignature, [
            vaultAppId,
            vaultBase,
            vaultInitPayload,
            false
        ]),
        encodeContractInteraction(dao, newAppInstanceSignature, [
            delayAppId,
            delayBase,
            delayInitPayload,
            true
        ]),
        encodeContractInteraction(dao, newAppInstanceSignature, [
            tokenManagerAppId,
            tokenManagerBase,
            fdai_managerInitPayload,
            false
        ]),
        encodeContractInteraction(dao, newAppInstanceSignature, [
            tokenRequestAppId,
            tokenRequestBase,
            token_requestInitPayload,
            true
        ]),
        encodeContractInteraction(dao, newAppInstanceSignature, [
            redemptionsAppId,
            redemptionsBase,
            redemptionsInitPayload,
            true
        ]),
        encodeContractInteraction(acl, createPermissionSignature, [
            voting,
            delayAddress,
            keccak256('SET_DELAY_ROLE'),
            delayAddress
        ]),
        encodeContractInteraction(acl, createPermissionSignature, [
            voting,
            delayAddress,
            keccak256('DELAY_EXECUTION_ROLE'),
            delayAddress
        ]),
        encodeContractInteraction(acl, createPermissionSignature, [
            community_dao,
            delayAddress,
            keccak256('PAUSE_EXECUTION_ROLE'),
            delayAddress
        ]),
        encodeContractInteraction(acl, createPermissionSignature, [
            voting,
            delayAddress,
            keccak256('RESUME_EXECUTION_ROLE'),
            delayAddress
        ]),
        encodeContractInteraction(acl, createPermissionSignature, [
            community_dao,
            delayAddress,
            keccak256('CANCEL_EXECUTION_ROLE'),
            delayAddress
        ]),
        encodeContractInteraction(acl, createPermissionSignature, [
            delayAddress,
            fdaiManagerAddress,
            keccak256('MINT_ROLE'),
            delayAddress
        ]),
        encodeContractInteraction(acl, createPermissionSignature, [
            redemptionsAddress,
            fdaiManagerAddress,
            keccak256('BURN_ROLE'),
            delayAddress
        ]),
        encodeContractInteraction(acl, createPermissionSignature, [
            redemptionsAddress,
            fdaiVaultAddress,
            keccak256('TRANSFER_ROLE'),
            delayAddress
        ]),
        encodeContractInteraction(acl, createPermissionSignature, [
            delayAddress,
            tokenrequestAddress,
            keccak256('SET_TOKEN_MANAGER_ROLE'),
            delayAddress
        ]),
        encodeContractInteraction(acl, createPermissionSignature, [
            delayAddress,
            tokenrequestAddress,
            keccak256('SET_VAULT_ROLE'),
            delayAddress
        ]),
        encodeContractInteraction(acl, createPermissionSignature, [
            delayAddress,
            tokenrequestAddress,
            keccak256('FINALISE_TOKEN_REQUEST_ROLE'),
            delayAddress
        ]),
        encodeContractInteraction(acl, createPermissionSignature, [
            ZERO_ADDRESS,
            redemptionsAddress,
            keccak256('REDEEM_ROLE'),
            delayAddress
        ])
    ]);

    const script = encodeCallScript(actions);

    await execAppMethod(
        dao,
        voting,
        'newVote',
        [
            script,
            `
          installing vault
          `
        ],
        () => {},
        network
    );
    bootstrapSpinner.succeed(
        `Vote at http://${network}.aragon.org/#/${dao}/${voting}`
    );
}

function getSigner() {
    const user = `/home/${require('os').userInfo().username}`;
    const secret = require(`${user}/.aragon/mnemonic.json`);
    const wallet = new Ethers.Wallet.fromMnemonic(secret.mnemonic);
    const ethersProvider = Ethers.getDefaultProvider(network, {
        infura: infura
    });
    const ethersSigner = wallet.connect(ethersProvider);
    return ethersSigner;
}

async function createCompanyDao(ethersSigner) {
    const deploySpinner = Ora('Deploying Dao...\n').start();
    const companyTemplateContract = new Ethers.Contract(
        COMPANY_TEMPLATE_ADDRESS,
        companyTemplateAbi,
        ethersSigner
    );

    const tx = await companyTemplateContract[newTokenAndInstance](
        tokenName,
        symbol,
        daoId,
        holders,
        balances,
        voteSettings,
        0,
        true
    );

    const daoAddress = await getDaoAddress(
        'DeployDao',
        companyTemplateContract,
        tx.hash
    );

    deploySpinner.succeed(
        `Dao Deployed: https://${network}.aragon.org/#/${daoAddress}`
    );
    return daoAddress;
}

async function deployToken(ethersSigner) {
    const fdaiSpinner = Ora('Deploying fDAI-1 Token...').start();
    const minimeFactory = new Ethers.ContractFactory(
        minimeAbi,
        minimeBytecode.object,
        ethersSigner
    );
    const minimeContract = await minimeFactory.deploy(
        MINIME_FACTORY_ADDRESS,
        ZERO_ADDRESS,
        0,
        'fDAI-1 Token',
        18,
        'FDAI1',
        true
    );
    fdaiSpinner.succeed(`fDAI-1 Deployed: ${minimeContract.address}`);
    return minimeContract;
}

async function changeTokenControler(minimeContract, fdai_manager) {
    const controlerSpinner = Ora(
        `Changing fDAI-1 controller to ${fdai_manager}`
    ).start();
    const changeControllerTx = await minimeContract.changeController(
        fdai_manager
    );
    await changeControllerTx.wait();
    controlerSpinner.succeed(
        `Changed controller: rinkeby.etherscan.io/tx/${changeControllerTx.hash}`
    );
    return changeControllerTx;
}

module.exports = {
    changeTokenControler,
    deployToken,
    createCompanyDao,
    getSigner,
    installScript,
    getApps,
    connectDAO,
    counterfactualAddress
};
