const ora = require('ora')

const spinner = ora('waiting 180 seconds').start();
let timer = 180

    setInterval(() => {
        timer = timer - 1
        spinner.text = `waiting ${timer.toString()} seconds`
        timer === 177 ? spinner.succeed('done'): false
    }, 1000)



