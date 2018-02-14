const inquirer = require('inquirer');
const Log = require('./util/log');
const chalk = require('chalk');
const boxen = require('boxen');
const Sentry = require('./app/sentry');

const { getActions, runAction } = require('./actions');

// log the header
console.log(boxen(
    chalk.black('Whitebox Auto Vetter'),
    { padding: 1, backgroundColor: 'white' }
));

(async () => {

    // ask question and get answer
    let answers = await inquirer.prompt({
        type: 'list',
        name: 'launch_action',
        message: 'What do you want to do?',
        choices: getActions()
    });

    // wrap context of the action in Sentry to catch exceptions
    await Sentry.asyncContext(async () => {
        // run the action associated with the answer chosen
        await runAction(answers.launch_action);
    });
    
})();
