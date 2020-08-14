const ora = require('ora');
const { connect, App, Organization } = require('@aragon/connect');

/* const spinner = ora('waiting 180 seconds').start();
let timer = 180; */

/*     setInterval(() => {
        timer = timer - 1
        spinner.text = `waiting ${timer.toString()} seconds`
        timer === 177 ? spinner.succeed('done'): false
    }, 1000) */

const main = async () => {
    const org = await connect('x.aragonid.eth', 'thegraph');
    
    console.log(org);
}

main()

