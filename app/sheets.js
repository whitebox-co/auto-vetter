/**
 * sheets.js
 * This file handles the Google Sheets API
 *
 * @author James Stine <Leon.Blade@gmail.com>
 */

const fs = require('fs');
const { google } = require('googleapis');
const sheets = google.sheets('v4');
const authServer = require('../util/authServer');
const Log = require('../util/log');
const _ = require('lodash');
const Sentry = require('./sentry');

// curry the breadcrumb function
const captureBreadcrumb = _.curry(Sentry.captureBreadcrumb)('sheets');

const SCOPES = [ 'https://www.googleapis.com/auth/spreadsheets' ];
const TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
const TOKEN_PATH = TOKEN_DIR + 'oauth-google-sheets.json';

class Sheets {

    /**
     * Create an instance of sheets class
     * @param   {String} client_id
     * @param   {String} client_secret
     */
    constructor(client_id, client_secret) {
        this.client_id = client_id;
        this.client_secret = client_secret;
    }

    /**
     * Call to authenticate with OAuth
     * @param {String} token An existing token
     */
    async authenticate() {
        // create a new oauth client
        this.oauth_client = new google.auth.OAuth2(
            this.client_id,
            this.client_secret,
            `http://localhost:${process.env.WEB_PORT}/callback`
        );

        captureBreadcrumb('Logging in to Google Sheets.');

        // get token variable ready
        let token;

        // try to get a token from the machine
        try {
            // read from the machine
            token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        }
        // if not then grab a new one from Google
        catch (e) {
            // start the oauth process
            token = await this.getAccessToken();
        }

        // set the token in the client
        this.oauth_client.credentials = token;
    }

    /**
     * Get a new access token from Google
     * @returns {String}
     */
    async getAccessToken() {
        if (!this.oauth_client)
            throw new Error("authenticate() should be called before getAccessToken()");

        // generate an auth url
        const auth_url = this.oauth_client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES
        });

        captureBreadcrumb('Generated URL for access token.');

        // get the creds from the URL
        const creds = await authServer.auth_me(auth_url);
        // get the access token from Google
        const token = (await this.oauth_client.getToken(creds.code)).tokens;

        // store the token on the machine
        this.storeToken(token);

        // return the token details
        return token;
    }

    /**
     * Gets an array of sheets
     * @param   {String} spreadsheetId The spreadsheet from Google Sheets
     * @returns {Promise}
     */
    async getSheets(spreadsheetId) {
        captureBreadcrumb('Requesting sheets of a specific spreadsheet ID', { spreadsheetId });
        const data = await this.getSpreadsheetInfo(spreadsheetId);
        return _.map(data.sheets, 'properties.title');
    }

    /**
     * Returns informtion about spreadsheet
     * @param {String} spreadsheetId The specified spreadsheet id
     * @returns {Promise}
     */
    async getSpreadsheetInfo(spreadsheetId) {
        captureBreadcrumb('Getting spreadsheet info', { spreadsheetId });
        return (await sheets.spreadsheets.get({ auth: this.oauth_client, spreadsheetId })).data;
    }

    /**
     * Gets sheet range
     * @param   {Sheet}  spreadsheetId
     * @param   {Sheet}  range
     * @returns {Promise}
     */
    async get(spreadsheetId, range, majorDimension = 'COLUMNS') {
        captureBreadcrumb(
            'Getting spreadsheet range',
            {
                spreadsheetId,
                range,
                majorDimension
            }
        );

        return (
            await sheets.spreadsheets.values.get({ 
                auth: this.oauth_client, 
                spreadsheetId, 
                range, 
                majorDimension
            })
        ).data;
    }

    /**
     * Gets sheet multiple ranges
     * @param   {Sheet}  spreadsheetId
     * @param   {Sheet}  range
     * @returns {Promise}
     */
    async batchGet(spreadsheetId, ranges, majorDimension = 'COLUMNS') {
        captureBreadcrumb(
            'Requesting batch get from spreadsheet ID',
            {
                spreadsheetId,
                ranges,
                majorDimension
            }
        );

        return (
            await sheets.spreadsheets.values.batchGet({
                auth: this.oauth_client,
                spreadsheetId,
                ranges,
                majorDimension
            })
        ).data;
    }

    /**
     * Update values for one sheet range
     * @param   {String}    spreadsheetId
     * @param   {String}    range
     * @param   {String[]}  values
     * @returns {Promise}
     */
    async update(spreadsheetId, range, values) {
        captureBreadcrumb(
            'Updating spreadsheet data',
            {
                spreadsheetId,
                range,
                values
            }
        );

        return (
            await sheets.spreadsheets.values.update({
                auth: this.oauth_client,
                spreadsheetId,
                range,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [ values ],
                    majorDimension: 'COLUMNS'
                }
            })
        ).data;
    }

    /**
     * Update values for multiple sheet ranges
     * @param   {String}    spreadsheetId
     * @param   {String[]}    ranges
     * @param   {String[]}  values
     * @returns {Promise}
     */
    async batchUpdate(spreadsheetId, ranges, values) {
        // sanitation of input
        if (!Array.isArray(ranges) || !Array.isArray(values))
            throw Error('Invalid data passed to update sheet ranges');
        if (ranges.length != values.length)
            throw Error('Ranges and Values arrays do not match in length');

        // data for batch update
        const data = [];

        // loop over ranges could be ranges or values as lengths are matching
        for (let i in ranges) {
            data.push({
                range: ranges[i],
                values: [ values[i] ],
                majorDimension: 'COLUMNS'
            });
        }

        captureBreadcrumb(
            'Batch updating spreadsheet data',
            {
                spreadsheetId,
                ranges,
                values,
                data
            }
		);

		return (
			await sheets.spreadsheets.values.batchUpdate({
				auth: this.oauth_client,
                spreadsheetId,
                resource: {
                    valueInputOption: 'USER_ENTERED',
                    data
                }
			})
		).data;
    }

    /**
     * Store the access token on the machine
     * @param   {String} token
     */
    storeToken(token) {
        try {
            // try to make directory for token
            fs.mkdirSync(TOKEN_DIR);
        }
        catch (e) {
            // if the error isn't that the folder exists
            if (e.code != 'EEXIST')
                Sentry.captureException(e);
        }

        // write the token to the machine
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
    }

    /**
     * Turns a number into a column letter
     * @param   {Number} column
     * @returns {String}
     */
    columnToLetter(column) {
        let temp, letter = '';
        while (column > 0) {
            temp = (column - 1) % 26;
            letter = String.fromCharCode(temp + 65) + letter;
            column = (column - temp - 1) / 26;
        }
        return letter;
    }

    /**
     * Turns a letter into a column number
     * @param   {String} letter
     * @returns {Number}
     */
    letterToColumn(letter) {
        let column = 0, length = letter.length;
        for (let i = 0; i < length; i++)
            column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
        return column;
    }

}

module.exports = Sheets;
