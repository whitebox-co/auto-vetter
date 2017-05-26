const chalk = require('chalk');

Log = {
    error: (message) => {
        console.log(chalk.black.bgRed(' ERROR '), message);
    },
    info: (message) => {
        console.log(chalk.blue('❯'), message);
    },
    warn: (message) => {
        console.log(chalk.yellow('‼'), message);
    },
    success: (message) => {
        console.log(logSymbols.success, message);
    }
};

module.exports = Log;
