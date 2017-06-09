const _ = require('lodash');
const ErrorStackParser = require('error-stack-parser');
const chalk = require('chalk');
const boxen = require('boxen');
const size = require('window-size');

String.prototype.flip = function () { return this.split('').reverse().join('') };

const printError = error => {
    // parse the error
    const parsed = ErrorStackParser.parse(error);
    const newParsed = [];

    _.forEach(parsed, err => {
        const fullName = `${err.fileName}:${err.lineNumber}:${err.columnNumber}`;
        const trunk = _.truncate(fullName.flip(), { length: size.get().width - 9 }).flip();
        newParsed.push(
`${chalk.dim('-')} ${chalk.yellow(err.fileName.split('/').pop())}${chalk.dim(':')}${chalk.yellow(err.lineNumber)} ${err.functionName}
${chalk.dim(trunk)}`);
    });

    console.log(boxen(
`${chalk.red.bold('ERROR')} ${error.message}

${chalk.white(newParsed.join('\n\n'))}
`, { borderColor: 'red', padding: 1 }));
}

module.exports = printError;
