const { createAction } = require('./');
const inquirer = require('inquirer');
const Log = require('../util/log');
const _ = require('lodash');
const chalk = require('chalk');
const Sheets = require('../app/sheets');
const MongoDB = require('../app/mongodb');
const Sentry = require('../app/sentry');

require('dotenv').config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const MONGO_HOST = process.env.MONGO_HOST;
const MONGO_PORT = process.env.MONGO_PORT;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

// curry the breadcrumb function
const captureBreadcrumb = _.curry(Sentry.captureBreadcrumb)('scrape');

// create instance of sheets
const sheets = new Sheets(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
// create the mongo db instance
const db = new MongoDB(MONGO_HOST, MONGO_PORT, MONGO_DB_NAME);

/**
 * Scrape action which creates new scrapes
 * @returns {Promise}
 */
const createScrape = async () => {

    // variables used within this function
    let answers, sheetInfo, sheetNames, sheetTitle, spreadsheetId;

    try {
        // authenticate with the client
        await sheets.authenticate();
    }
    catch (ex) {
        throw ex;
    }

    // loop over until we accept
    while (true) {
        // ask for the spreadsheet ID
        answers = await inquirer.prompt([{
            type: 'input',
            name: 'spreadsheetId',
            message: 'Enter the Google Spreadsheet ID',
            validate: async input => {
                // ensure the entry isn't empty
                if (_.isEmpty(input))
                    return 'Spreadsheet ID can\'t be empty.';

                // get sheet names to see if the id is valid
                try {
                    sheetInfo = await sheets.getSpreadsheetInfo(input);
                }
                catch (err) {
                    // sheet request came back 404 (notFound)
                    if (err.code == 404)
                        return 'Spreadsheet ID not found!';

                    // rethrow the exception
                    throw err;
                }

                sheetTitle = sheetInfo.properties.title;
                sheetNames = _.map(sheetInfo, 'sheets.properties.title');
                spreadsheetId = input;

                return true;
            }
        }]);

        // ask if this is the right one
        answers = await inquirer.prompt([{
            type: 'confirm',
            name: 'yes',
            message: `${sheetInfo.properties.title}, is that correct?`
        }]);

        if (answers.yes)
            break;

    }

    // breadcrumb our sheet ID as a successful action
    captureBreadcrumb('User selected spreadsheet ID', { spreadsheetId });

    try {
        // get information about the spreadsheet
        sheetNames = await sheets.getSheets(spreadsheetId);
    }
    catch (ex) {
        throw ex;
    }

    // verify that our sheet names is an array
    if (!_.isArray(sheetNames))
        throw new Error('Sheet names came back not as an array');
    if (!sheetNames.length)
        throw new Error('No sheet names found');

    // get which sheet to use
    answers = await inquirer.prompt([{
        type: 'list',
        name: 'sheetName',
        message: 'Which sheet are we using',
        choices: sheetNames
    }]);

    // get the sheet name out from answers
    const sheetName = answers.sheetName;

    // get the header column data for this sheet
    // NOTE: this assumes header row is on row 1
    const colsData = await sheets.get(spreadsheetId, `${sheetName}!1:1`, 'ROWS');
    // get the column values from the data
    let colsValues = colsData.values.shift();

    // create an incr variable for column to letter in the remap
    let colIncr = 1;
    // map the values array
    colsValues = _.map(colsValues, col => {
        return { name: col, value: sheets.columnToLetter(colIncr++) };
    });

    // get which column for URLs to use
    answers = await inquirer.prompt([{
        type: 'list',
        name: 'columnLetter',
        message: 'Which column is for URLs',
        choices: colsValues
    }]);

    // get the column letter
    const columnLetter = answers.columnLetter;

    // form the range for the request
    // NOTE: this assumes header row is on row 1
    const range = `${sheetName}!${columnLetter}2:${columnLetter}`;

    // grab all the column data from this range
    const urlData = await sheets.get(spreadsheetId, range);
    // ensure that the values property exists
    if (!_.has(urlData, 'values'))
        throw new Error(`Column '${columnLetter}' does not contain any values!`);

    // get the URL values
    const urlValues = urlData.values.shift();

    // log how many URLs we have
    Log.info(`This sheet has ${chalk.blue.bold(urlValues.length)} URLs to scrape.`);

    try {
        // connect to the database
        await db.connect();
    }
    catch (ex) {
        throw ex;
    }

    // create variables for collection name
    let collectionName = spreadsheetId.slice(0, 10) + sheetName, // the collection name
        tempName = collectionName, // temp collection name in case we get conflict
        incr = 0, // counter for how many tries we've made/appending to collection name
        limit = 100; // 100 tries before giving up on name

    // does the collection exist already so we can warn about it
    while (await db.doesCollectionExist(tempName)) {

        // warn the user that the collection name exists
        Log.warn(`The collection name ${chalk.blue.bold(tempName)} already exists!`);

        // ask if we want to rename the collection
        answers = await inquirer.prompt([{
            type: 'confirm',
            name: 'use',
            message: 'Do you want to use the existing collection?',
            default: false
        }]);

        // if we don't want to rename then just break out of loop
        if (answers.use)
            break;

        // try another name
        tempName = collectionName + '_' + incr++;

        // prevent infinite loop by only trying up to a limit
        if (incr >= limit)
            throw new Error('Failed creating unique collection name!');
    }

    // assign the collection name back to the regular variable
    collectionName = tempName;

    // do a check if we encountered a conflict and chose use
    if (_.has(answers, 'use') && answers.use) {
        // warn about using an existing collection
        Log.warn('Using this collection without matching sheet data can cause problems!');

        // prompt the user if they want to delete the existing collection first
        answers = await inquirer.prompt([{
            type: 'confirm',
            name: 'delete',
            message: 'Do you want to delete the existing collection first',
            default: false
        }]);

        // user chose to delete the existing collection first
        if (answers.delete)
            await db.drop(collectionName);
    }

    // insert information about the sheet for the scrape job
    // await db.insert('sheets', { name: sheetTitle, spreadsheetId, sheetName, urlColumn: columnLetter });

    // log which name we're using for the collection
    Log.info(`The MongoDB collection name is ${chalk.blue.bold(collectionName)}`);

    // close mongodb connection
    db.close();

    return { name: sheetTitle, spreadsheetId, sheetName, urlColumn: columnLetter };
}

/**
 * Scrape action which runs existing scrapes
 * @returns {Promise}
 */
const runScraper = async () => {

    captureBreadcrumb('Grabbing scrape data from database.');

    // pull in the existing scrapes
    await db.connect();
    const data = await db.find('sheets');
    const choices = _.map(data, sheet => {
        return {
            name: `${sheet.name} (${sheet.sheetName})`,
            value: sheet._id
        }
    });

    // ask which scrape to run
    let answers = await inquirer.prompt([{
        type: 'list',
        name: 'scrape',
        message: 'Which scrape do you want to run',
        choices
    }]);

    // pull out the variables for the scrape we want
    const scrape = data[_.findIndex(data, { _id: answers.scrape })];

    try {
        // auth with sheets
        await sheets.authenticate();

    }
    catch (err) {
        throw err;
    }

    // close mongodb connection
    db.close();
}

module.exports = {
    create_scrape: createAction('Create new scrape', createScrape),
    run_scrape: createAction('Run scraper', runScraper)
};
