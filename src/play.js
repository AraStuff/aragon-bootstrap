const Chalk = require('chalk');
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

// ABIs

const companyTemplateAbi = require('./abi/companyTemplate.json');

const minimeAbi = require('./abi/minime.json');
const minimeBytecode = require('./bytecode/minime.json');

// Bare Template address in aragonPM (rinkeby)
const COMPANY_TEMPLATE_ADDRESS = '0xA3809a525B92a8A290E5d704f9Be6B5046506A7b';
const MINIME_FACTORY_ADDRESS = '0x6ffeB4038f7F077C4D20EAF1706980CaeC31e2BF';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const daiAddress = '0x0527e400502d0cb4f214dd0d2f2a323fc88ff924';
const community_dao = '0x75B98710D5995AB9992F02492B7568b43133161D';

// DAO settings
const network = 'rinkeby';

// signatures
const vaultAppId =
    '0x7e852e0fcfce6551c13800f1e7476f982525c2b5277ba14b24339c68416336d1';
const vaultBase =
    network === 'rinkeby'
        ? '0x35c5Abf253C873deE9ee4fe2687CD378Eff1263e'
        : '0x03AD07802BBA1b6FA293E593a42845E6569A7470';

const fdai_managerAppId =
    '0x6b20a3010614eeebf2138ccec99f028a61c811b3b1a3343b6ff635985c75c91f';
const fdai_managerBase =
    network === 'rinkeby'
        ? '0xE775468F3Ee275f740A22EB9DD7aDBa9b7933Aa0'
        : '0xde3A93028F2283cc28756B3674BD657eaFB992f4';

const delayAppId =
    '0x1c2b93ad1c4d4302f0169c8f596ce518e4a3324b1fed90c2d80a549a072bcd4e';
const delayBase =
    network === 'rinkeby'
        ? '0x214044cc3fa7a3ECEF0bC9052Fe9B296585E3275'
        : '0x07759C39BbC1F88CA6b61B5EF500472Ca606DF89';

const token_requestAppId =
    '0x35202e36ef42162f9847025dfc040c60bfa5d7c5c373cb28e30849e1db16ba77';
const token_requestBase =
    network === 'rinkeby'
        ? '0x9bb880490625E1a0222d47f6b6409110E634691b'
        : '0x60aaD13723BF122254707612455c10AE9DF517b2';

const redemptionsAppId =
    '0x743bd419d5c9061290b181b19e114f36e9cc9ddb42b4e54fc811edb22eb85e9d';
const redemptionsBase =
    network === 'rinkeby'
        ? '0xe47d2A5D3319E30D1078DB181966707d8a58dE98'
        : '0x5B1f69304651b3e7a9789D27e84f1F7336c356e8';

const newAppInstanceSignature = 'newAppInstance(bytes32,address,bytes,bool)';
const createPermissionSignature =
    'createPermission(address,address,bytes32,address)';
const fdai_managerInitSignature = 'initialize(address,bool,uint256)'; //
const delayInitSignature = 'initialize(uint64)';
const token_requestInitSignature = 'initialize(address,address,address[])'; // _tokenManager, _vault,_acceptedDepositTokens
const redemptionsInitSignature = 'initialize(address,address,address[])'; // _vault, _tokenManager,_redeemableTokens
const vaultInitSignature = 'initialize()';
const newTokenAndInstance =
    'newTokenAndInstance(string,string,string,address[],uint256[],uint64[3],uint64,bool)';

// key
const secret = require(`/home/${
    require('os').userInfo().username
}/.aragon/mnemonic.json`);
const key = secret.mnemonic;

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

async function getAppAddress(
    selectedFilter,
    templateContract,
    transactionHash
) {
    return new Promise((resolve, reject) => {
        const desiredFilter = templateContract.filters[selectedFilter]();

        templateContract.on(
            desiredFilter,
            (appProxyAddress, isUpgradeable, appId, event) => {
                if (event.transactionHash === transactionHash) {
                    resolve(appProxyAddress);
                }
            }
        );
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
    const spinner = Ora(
        `waiting 180 seconds for DAO to be indexed on TheGraph.com`
    ).start();
    const p = new Promise(async (resolve, reject) => {
        let timer = 120;
        let org;
        const timeout = setIntervalAsync(async () => {
            timer = timer - 1;
            spinner.text = `waiting ${timer} seconds for DAO to be indexed at TheGraph.com`;
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
    return {
        token_manager: apps.find((app) => app.name === 'token-manager').address,
        voting: apps.find((app) => app.name === 'voting').address,
        agent: apps.find((app) => app.name === 'agent').address,
        finance: apps.find((app) => app.name === 'finance').address
    };
}

async function getAcl(org) {
    const permissions = await org.permissions();
    return permissions.filter(
        (p) =>
            p.roleHash ===
            `0x0b719b33c83b8e5d300c521cb8b54ae9bd933996a14bef8c2f4e0285d2d2400a`
    )[0].appAddress;
}

async function bootstrapApps(
    fdaiAddress,
    daiAddress,
    fdaiManagerAddress,
    fdaiVaultAddress,
    delayAddress,
    tokenrequestAddress,
    redemptionsAddress,
    voting,
    dao,
    acl
) {
    // app initialisation payloads
    const vaultInitPayload = await encodeActCall(vaultInitSignature, []);
    const fdai_managerInitPayload = await encodeActCall(
        fdai_managerInitSignature,
        [fdaiAddress, true, 0]
    );
    const delayInitPayload = await encodeActCall(delayInitSignature, [1000]);
    const token_requestInitPayload = await encodeActCall(
        token_requestInitSignature,
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
            fdai_managerAppId,
            fdai_managerBase,
            fdai_managerInitPayload,
            false
        ]),
        encodeContractInteraction(dao, newAppInstanceSignature, [
            token_requestAppId,
            token_requestBase,
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
}

async function main() {
    try {
        const wallet = new Ethers.Wallet.fromMnemonic(key);
        const ethersProvider = Ethers.getDefaultProvider(network, {
            infura: 'e22eadb98be944d18e48ab4bec7ecf3f'
        });
        const ethersSigner = wallet.connect(ethersProvider);

        // Account used to initialize permissions
        const dictatorAccount = await ethersSigner.address;
        console.log(
            Chalk.cyan(`Using ${dictatorAccount} as account for permissions`)
        );

        const deploySpinner = Ora('Deploying Dao...').start();
        const companyTemplateContract = new Ethers.Contract(
            COMPANY_TEMPLATE_ADDRESS,
            companyTemplateAbi,
            ethersSigner
        );

        // Get the proper function we want to call; ethers will not get the overload
        // automatically, so we take the proper one from the object, and then call it.
        const tx = await companyTemplateContract[newTokenAndInstance](
            'Token',
            'TKN',
            'Testing' + Math.random(),
            ['0x75B98710D5995AB9992F02492B7568b43133161D'],
            ['1000000000000000000'],
            ['500000000000000000', '250000000000000000', 86400],
            0,
            true
        );
        // Filter and get the DAO address from the events.
        const daoAddress = await getDaoAddress(
            'DeployDao',
            companyTemplateContract,
            tx.hash
        );

        // Log the DAO Address
        deploySpinner.succeed(
            `Dao Deployed: https://${network}.aragon.org/#/${daoAddress}`
        );

        // generating counterfactual addresses
        const counterfactualSpinner = Ora(
            'Calculating counterfactual Address...'
        ).start();
        const vaultSpinner = Ora('Calculating Vault Address...').start();
        const vault = await counterfactualAddress(daoAddress, 0, network);
        vaultSpinner.succeed(`Vault: ${vault}`);

        const delaySpinner = Ora('Calculating delay Address...').start();
        const delay = await counterfactualAddress(daoAddress, 1, network);
        delaySpinner.succeed(`delay: ${delay}`);

        const fdai_manager = await counterfactualAddress(
            daoAddress,
            2,
            network
        );

        const token_requestSpinner = Ora(
            'Calculating token_request Address...'
        ).start();
        const token_request = await counterfactualAddress(
            daoAddress,
            3,
            network
        );
        token_requestSpinner.succeed(`token_request: ${token_request}`);

        const redemptionsSpinner = Ora(
            'Calculating redemptions address...'
        ).start();
        const redemptions = await counterfactualAddress(daoAddress, 4, network);
        redemptionsSpinner.succeed(`redemptions: ${redemptions}`);

        counterfactualSpinner.succeed('Counterfactual Addresses calculated');

        // deploy fDAI-1 Token
        const minimeFactory = new Ethers.ContractFactory(
            minimeAbi,
            minimeBytecode.object,
            ethersSigner
        );

        const fdaiSpinner = Ora('Deploying fDAI-1 Token...').start();
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

        // change controller
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

        // connect DAO
        const org = await connectDAO(daoAddress, network);
        //console.log(org);
        const apps = await getApps(org);

        const aclSpinner = Ora('Calculating acl address...').start();
        const acl = await getAcl(org);
        aclSpinner.succeed(`acl: ${acl}`);

        const bootstrapSpinner = Ora('bootstrap _Prtcl Apps').start();
        await bootstrapApps(
            minimeContract.address,
            daiAddress,
            fdai_manager,
            vault,
            delay,
            token_request,
            redemptions,
            apps.voting,
            daoAddress,
            acl
        );
        bootstrapSpinner.succeed(
            `Vote at http://${network}.aragon.org/#/${daoAddress}/${apps.voting}`
        );
    } catch (e) {
        console.log(e);
    } finally {
        process.exit();
    }
}

main();
