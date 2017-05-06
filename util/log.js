var chalk = require('chalk');

Log = {
    error: (message) => {
        console.log(chalk.bold.red('ERROR'), message);
    },
    info: (message) => {
        console.log(chalk.bold.blue('INFO'), message);
    },
    warn: (message) => {
        console.log(chalk.bold.yellow('WARN'), message);
    }
};

module.exports = Log;
