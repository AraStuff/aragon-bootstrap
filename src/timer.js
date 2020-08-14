const ora = require('ora');
const { connect, App, Organization } = require('@aragon/connect');

async function getApps(dao) {
    const apps = await dao.apps();
    return {
        token_manager: apps.find((app) => app.name === 'token-manager').address,
        voting: apps.find((app) => app.name === 'voting').address,
        agent: apps.find((app) => app.name === 'agent').address,
        finance: apps.find((app) => app.name === 'finance').address
    };
}
/* const spinner = ora('waiting 180 seconds').start();
let timer = 180; */

/*     setInterval(() => {
        timer = timer - 1
        spinner.text = `waiting ${timer.toString()} seconds`
        timer === 177 ? spinner.succeed('done'): false
    }, 1000) */

const main = async () => {
    const org = await connect('0xa6aa1A5Bc9860A7ea37e2084d0116773f3F90cFa', 'thegraph', { network: 'rinkeby' });
    const apps = await getApps(org)
    console.log(apps);
}

main()
.catch(err => console.log(err))
.then(process.exit)

