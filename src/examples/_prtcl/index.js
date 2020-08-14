const Chalk = require('chalk');
const Ora = require('ora');
const { network, daiAddress } = require('../../daoSettings');
const {
    getSigner,
    createCompanyDao,
    counterfactualAddress,
    deployToken,
    changeTokenControler,
    connectDAO,
    getApps,
    installScript
} = require('../../lib/helpers');

async function main() {

    // 1. get Signer
    const ethersSigner = getSigner();
    const deployer = await ethersSigner.address;
    console.log(`Using ${Chalk.cyan(deployer)}`);

    // 2. Deploy Company DAO
    const daoAddress = await createCompanyDao(ethersSigner);

    // 3. generating counterfactual addresses
    const counterfactualSpinner = Ora('Counterfactual Addresses..').start();
    const vault = await counterfactualAddress(daoAddress, 0, network);
    const delay = await counterfactualAddress(daoAddress, 1, network);
    const fdai_manager = await counterfactualAddress(daoAddress, 2, network);
    const token_request = await counterfactualAddress(daoAddress, 3, network);
    const redemptions = await counterfactualAddress(daoAddress, 4, network);
    counterfactualSpinner.succeed('Counterfactual Addresses calculated');

    // 4. deploy fDAI-1 Token
    const minimeContract = await deployToken(ethersSigner);

    // 5. change controller
    await changeTokenControler(minimeContract, fdai_manager);

    // 6. connect DAO
    const org = await connectDAO(daoAddress, network);
    const apps = await getApps(org);
    const { voting, acl } = apps;

    // 7. Install apps and permissions
    await installScript(
        minimeContract.address,
        daiAddress,
        fdai_manager,
        vault,
        delay,
        token_request,
        redemptions,
        voting,
        daoAddress,
        acl,
        network
    );
}

main()
    .then(() => {
        process.exit();
    })
    .catch((e) => {
        console.error(e);
        process.exit();
    });
