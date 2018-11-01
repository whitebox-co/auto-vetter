const chalk = require('chalk');

class Log {

    /**
     * Print an error message
     * @param {String} message
     */
    static error(message) {
        console.log(chalk.black.bgRed(' ERROR '), message);
    }

    /**
     * Print an info message
     * @param {String} message 
     */
    static info(message) {
        console.log(chalk.blue('❯'), message);
    }

    /**
     * Print a warning message
     * @param {String} message 
     */
    static warn(message) {
        console.log(chalk.yellow('‼'), message);
    }

    /**
     * Print a success message
     * @param {String} message 
     */
    static success(message) {
        console.log(logSymbols.success, message);
    }
    
}

module.exports = Log;
