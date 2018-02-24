const _ = require('lodash');
const ErrorStackParser = require('error-stack-parser');
const chalk = require('chalk');
const boxen = require('boxen');
const size = require('window-size');
const wrap = require('wordwrap')(80);

String.prototype.flip = function () { return this.split('').reverse().join('') };

const printError = error => {
    // parse the error
    const newParsed = [];
    try {
        const parsed = ErrorStackParser.parse(error);
        const newParsed = [];

        _.forEach(parsed, err => {
            const fullName = wrap(`${err.fileName}:${err.lineNumber}:${err.columnNumber}`);
            const trunk = _.truncate(fullName.flip(), { length: size.get().width - 22 }).flip();
            newParsed.push(
`${chalk.dim('-')} ${chalk.yellow(err.fileName.split('/').pop())}${chalk.dim(':')}${chalk.yellow(err.lineNumber)} ${err.functionName}
${chalk.dim(trunk)}`);
        });
        const headline = wrap(`${chalk.red.bold('ERROR')} ${error.message}`);
        console.log(boxen(
`${headline}

${chalk.white(newParsed.join('\n\n'))}
            `, { borderColor: 'red', padding: 1 }));
    }
    catch (ex) {
        console.log(`${chalk.red.bold('ERROR')} ${error.message}`);
    }
    
}

module.exports = printError;
