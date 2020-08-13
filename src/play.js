const Chalk = require('chalk');
const Ethers = require('ethers');
const Namehash = require('eth-ens-namehash');
const EthProvider = require('eth-provider');
const Ora = require('ora');
const RLP = require('rlp')
const {keccak256} = require('web3-utils');


// ABIs
const aclAbi = require('./abi/acl.json');
const bareTemplateAbi = require('./abi/bareTemplate.json');
const companyTemplateAbi = require('./abi/companyTemplate.json')
const financeAbi = require('./abi/finance.json');
const kernelAbi = require('./abi/kernel.json');
const minimeAbi = require('./abi/minime.json');
const minimeBytecode = require('./bytecode/minime.json');
const tokenManagerAbi = require('./abi/tokenManager.json');
const vaultAbi = require('./abi/vault.json');
const votingAbi = require('./abi/voting.json');

// Bare Template address in aragonPM (rinkeby)
const COMPANY_TEMPLATE_ADDRESS = '0xA3809a525B92a8A290E5d704f9Be6B5046506A7b';
const BARE_TEMPLATE_ADDRESS = '0x789e4695d4D24EBFAcbccDd951A3D4075C5ce261';
const MINIME_FACTORY_ADDRESS = '0x6ffeB4038f7F077C4D20EAF1706980CaeC31e2BF';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// DAO settings
const network = 'rinkeby';

// signatures
const newTokenAndInstance = 'newTokenAndInstance(string,string,string,address[],uint256[],uint64[3],uint64,bool)'

// App info; we need these for installation.
// APP_ID: The appId is just the namehash of the aragonpm name. If the app lives
// on the "open" space for apps (open.aragonpm.eth), we need to prepend that
// to the app name as well.
// IMPL_ADDRESS: The implementation address of the latest version deployed.
// ..._ROLE: Roles defined in the app contract. An easy way to get these is just to use
// https://emn178.github.io/online-tools/keccak_256.html
// You can see the latest deployments on the repo below.
// https://github.com/aragon/deployments/blob/master/environments/rinkeby/deploys.yml
// NOTE: These correspond to the rinkeby network.
// ACL
const ACL_CREATE_PERMISSIONS_ROLE =
  '0x0b719b33c83b8e5d300c521cb8b54ae9bd933996a14bef8c2f4e0285d2d2400a';
// Finance
const FINANCE_APP_ID = Namehash.hash('finance.aragonpm.eth');
const FINANCE_IMPL_ADDRESS = '0x94D3013A8700E8B168f66529aD143590CC6b259d';
const FINANCE_CREATE_PAYMENTS_ROLE =
  '0x5de467a460382d13defdc02aacddc9c7d6605d6d4e0b8bd2f70732cae8ea17bc';
const FINANCE_EXECUTE_PAYMENTS_ROLE =
  '0x563165d3eae48bcb0a092543ca070d989169c98357e9a1b324ec5da44bab75fd';
const FINANCE_MANAGE_PAYMENTS_ROLE =
  '0x30597dd103acfaef0649675953d9cb22faadab7e9d9ed57acc1c429d04b80777';
// Kernel
const KERNEL_MANAGE_APPS_ROLE =
  '0xb6d92708f3d4817afc106147d969e229ced5c46e65e0a5002a0d391287762bd0';
// Token manager
const TOKEN_MANAGER_APP_ID = Namehash.hash('token-manager.aragonpm.eth');
const TOKEN_MANAGER_IMPL_ADDRESS = '0xE775468F3Ee275f740A22EB9DD7aDBa9b7933Aa0';
const TOKEN_MANAGER_MINT_ROLE =
  '0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c3686';
// Vault
const VAULT_APP_ID = Namehash.hash('vault.aragonpm.eth');
const VAULT_IMPL_ADDRESS = '0x35c5Abf253C873deE9ee4fe2687CD378Eff1263e';
const VAULT_TRANSFER_ROLE =
  '0x8502233096d909befbda0999bb8ea2f3a6be3c138b9fbf003752a4c8bce86f6c';
// Voting
const VOTING_APP_ID = Namehash.hash('voting.aragonpm.eth');
const VOTING_IMPL_ADDRESS = '0xb4fa71b3352D48AA93D34d085f87bb4aF0cE6Ab5';
const VOTING_CREATE_VOTES_ROLE =
  '0xe7dcd7275292e064d090fbc5f3bd7995be23b502c1fed5cd94cfddbbdcd32bbc';

// key
const secret = require(`/home/${require('os').userInfo().username}/.aragon/mnemonic.json`)
const key = secret.mnemonic

function bigNum(number) {
  return Ethers.utils.bigNumberify(number);
}

async function getDaoAddress(
  selectedFilter,
  templateContract,
  transactionHash,
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
  transactionHash,
) {
  return new Promise((resolve, reject) => {
    const desiredFilter = templateContract.filters[selectedFilter]();

    templateContract.on(
      desiredFilter,
      (appProxyAddress, isUpgradeable, appId, event) => {
        if (event.transactionHash === transactionHash) {
          resolve(appProxyAddress);
        }
      },
    );
  });
}


async function buildNonceForAddress(_address, _index) {
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
    provider = Ethers.getDefaultProvider(network);
    const nonce = await buildNonceForAddress(_address, _index, provider)
    return calculateNewProxyAddress(_address, nonce)
}

async function encodeContractInteraction(contract, signature, params) {
    const data = await encodeActCall(signature, params)
    return {
        to: contract,
        calldata: data
    }
}


async function main() {
  try {
    const wallet = new Ethers.Wallet.fromMnemonic(key)
    const ethersProvider = Ethers.getDefaultProvider(network, {
        infura: 'e22eadb98be944d18e48ab4bec7ecf3f'
    })
    const ethersSigner = wallet.connect(ethersProvider)

    // Account used to initialize permissions
    const dictatorAccount = await ethersSigner.address;
    console.log(
      Chalk.cyan(`Using ${dictatorAccount} as account for permissions`),
    );

    const companyTemplateContract = new Ethers.Contract(
        COMPANY_TEMPLATE_ADDRESS,
        companyTemplateAbi,
        ethersSigner,
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
      tx.hash,
    );

    // Log the DAO Address
    console.log(`Dao Deployed: ${daoAddress}`);

    // deploy fDAI-1 Token
    const minimeFactory = new Ethers.ContractFactory(
        minimeAbi,
        minimeBytecode.object,
        ethersSigner,
      );
  
    const fdaiSpinner = Ora('Deploying fDAI-1 Token...').start();
    const minimeContract = await minimeFactory.deploy(
        MINIME_FACTORY_ADDRESS,
        ZERO_ADDRESS,
        0,
        'fDAI-1 Token',
        18,
        'FDAI1',
        true,
      );

    // Calculate fDAI Manager Address
    fdaiSpinner.succeed(`fDAI-1 Token Deployed ${minimeContract.address}`);
    const tokenmanagerSpinner = Ora('Calculating fDAI Token Manager Address...').start();
    const fdai_manager = await counterfactualAddress(daoAddress, 0, network);
    tokenmanagerSpinner.succeed(`fDAI-1 Manager: ${fdai_manager}`)
 
  } catch (e) {
    console.log(e);
  } finally {
    process.exit();
  }
}

main();
