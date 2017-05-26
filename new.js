const assert = require('assert');
const inquirer = require('inquirer');
const Log = require('./util/log');
const chalk = require('chalk');
const boxen = require('boxen');
const ls = require('log-symbols');
const Sheets = require('./app/sheets');
const MongoDB = require('./app/mongodb');

require('dotenv').config();

const client_id = process.env.GOOGLE_CLIENT_ID;
const client_secret = process.env.GOOGLE_CLIENT_SECRET;

const mongo_ip = 'localhost';
const mongo_port = 27017;
const mongo_db = 'whitebox';

// log the header
console.log(boxen(
    chalk.black('Whitebox Scraper'),
    { padding: 1, backgroundColor: 'white' }
));

(async () => {

    // create sheets
    const sheets = new Sheets(client_id, client_secret);

    // authenticate with sheets
    await sheets.authenticate();

    // ask question and get answer
    let answers = await inquirer.prompt({
        type: 'list',
        name: 'launch_action',
        message: 'What do you want to do?',
        choices: [
            'New scrape',
            'Resume scrape',
            new inquirer.Separator(),
            'Scrape Facebook Likes',
            'Scrape Amazon',
            new inquirer.Separator(),
            'Re-authenticate with Google'
        ]
    });

    // if its not what we want then go away
    if (answers.launch_action != 'New scrape')
        return console.log(`${ls.error} ${answers.launch_action} is not yet supported!`);

    // ask a new question
    answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'sheet_id',
            message: 'Enter the Google Spreadsheet ID'
        }/*,
        {
            type: 'input',
            name: 'sheet_name',
            message: 'Enter the Sheet name'
        }*/
    ]);

    // grab the sheet id ane name
    const sheet_id = answers.sheet_id;

    // get the sheet names to ask about
    const names = await sheets.getSheets(sheet_id);

    // get which column populated with URLs you want
    answers = await inquirer.prompt([{
        type: 'list',
        name: 'sheet_name',
        message: 'Which sheet?',
        choices: names
    }]);

    // pull the sheet name from answers
    const sheet_name = answers.sheet_name;

    // get the first header rows from the sheet
    const cols_data = await sheets.get(sheet_id, `${sheet_name}!1:1`, 'ROWS');
    const cols = cols_data.values.shift();

    // get which column populated with URLs you want
    answers = await inquirer.prompt([{
        type: 'list',
        name: 'url_column',
        message: 'Which column is for URLs',
        choices: cols
    }]);

    // get the column index from the choices
    const letter = sheets.columnToLetter(cols.indexOf(answers.url_column) + 1);
    // get the range for the select column
    const range = `${sheet_name}!${letter}2:${letter}`;

    // get the rows data
    const rows_data = await sheets.get(sheet_id, range);
    const rows = rows_data.values.shift();

    // log the url count
    Log.info(`There are a total of ${chalk.bold.blue(rows.length)} URLs to scrape.`);

    // create the collection name
    let collection_name = sheet_id.slice(0, 10) + '_' + sheet_name;

    // create mongo instance
    const mongo = new MongoDB(mongo_ip, mongo_port, mongo_db);
    // connect to MongoDB
    await mongo.connect();

    // incer
    let incr = 2;
    let temp_name = collection_name;
    const limit = 100;

    // does the collection exist already so we can warn about it
    while (await mongo.doesCollectionExist(temp_name)) {

        Log.warn(`The collection name ${chalk.blue.bold(temp_name)} already exists!`);

        // ask if we want to rename the collection
        answers = await inquirer.prompt([{
            type: 'confirm',
            name: 'useit',
            message: 'Do you want to use the existing collection?'
        }]);

        // if we don't want to rename then just break out of loop
        if (answers.useit)
            break;

        temp_name = collection_name + '_' + incr++;

        // prevent infinite loop by only trying up to a limit
        if (incr >= limit)
            throw Error('Failed creating unique collection name!');
    }

    // check if we want to dump the collection first
    if (answers.hasOwnProperty('useit') && answers.useit) {
        answers = await inquirer.prompt([{
            type: 'confirm',
            name: 'delete',
            message: 'Do you want to delete the data first?'
        }]);

        // delete the data if we want to first
        if (answers.delete)
            await mongo.drop(temp_name);
    }

    // reassign the collection name
    collection_name = temp_name;

    Log.info(`The collection name for this scrape is ${chalk.blue.bold(collection_name)}`);

})();
