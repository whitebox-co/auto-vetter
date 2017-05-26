const { createAction } = require('./');
const inquirer = require('inquirer');
const Log = require('../util/log');
const Sheets = require('../app/sheets');

require('dotenv').config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

/**
 * Scrape action which handles
 * @returns {Promise} [description]
 */
const scrape = async () => {

    // variables used within this function
    let answers, sheetNames, colsValues;

    // ask for the spreadsheet ID
    answers = await inquirer.prompt([{
        type: 'input',
        name: 'spreadsheetId',
        message: 'Enter the Google Spreadsheet ID'
    }]);

    // get the spreadsheet id from answers
    const spreadsheetId = answers.spreadsheetId;
    // ensure its not empty
    _.isEmpty(spreadsheetId) && throw 'Spreadsheet ID is empty!';

    // create instance of sheets
    const sheets = new Sheets(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

    try {
        // authenticate with the client
        await sheets.authenticate();
        // get information about the spreadsheet
        sheetNames = await sheets.getSheets(spreadsheetId);
    }
    catch (ex) {
        Log.error('Could not request spreadsheet with ID: ' + chalk.blue.bold(answers))
        throw ex;
    }

    // verify that our sheet names is an array
    if (!_.isArray(sheetNames))
        throw 'Sheet names came back not as an array';

    // get which sheet to use
    answers = await inquirer.prompt([{
        type: 'list',
        name: 'sheetName',
        message: 'Which sheet are we using',
        choices: sheetNames
    }]);

    // get the sheet name out from answers
    const sheetName = answers.sheetName;

    // get the header column data for this sheet assuming the header row is 1
    const colsData = await sheets.get(spreadsheetId, `${sheetName}!1:1`, 'ROWS');
    // get the column values from the data
    colsValues = colsData.values.shift();

    colsValues = _.map(colsValues, col => {
        return {  }
    });

    // get which column for URLs to use
    answers = await inquirer.prompt([{
        type: 'list',
        name: 'colName',
        message: 'Which column is for URLs',
        choices: colsValues
    }]);


}

module.exports = createAction('Start new scrape', scrape);
