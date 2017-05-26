/**
 * sheets.js
 * This file handles the Google Sheets API
 *
 * @author James Stine <Leon.Blade@gmail.com>
 */

const fs = require('fs');
const google = require('googleapis');
const sheets = google.sheets('v4');
const googleAuth = require('google-auth-library');
const authServer = require('../util/authServer');
const Log = require('../util/log');
const asyncWrap = require('../util/asyncWrap');
const _ = require('lodash');

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
        this.oauth_client = null;
    }

    /**
     * Call to authenticate with OAuth
     * @param {String} token An existing token
     */
    async authenticate() {
        // create instance of Google Auth
        const auth = new googleAuth();

        // create a new oauth client
        this.oauth_client = new auth.OAuth2(
            this.client_id,
            this.client_secret,
            'http://localhost:8080/callback'
        );

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
            token = await this.getAccessToken(this.oauth_client);
        }

        // set the token in the client
        this.oauth_client.credentials = token;
    }

    /**
     * Get a new access token from Google
     * @param   {googleAuth.auth.OAuth2} oauth_client
     * @returns {String}
     */
    async getAccessToken(oauth_client) {
        // generate an auth url
        const auth_url = oauth_client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES
        });

        // get the creds from the URL
        const creds = await authServer.auth_me(auth_url);
        // get the access token from Google
        const token = await asyncWrap([ oauth_client, 'getToken' ], creds.code);

        // store the token on the machine
        this.storeToken(token);

        // return the token details
        return token;
    }

    /**
     * Gets an array of sheets
     * @param   {String} spreadsheetId
     * @returns {Promise}
     */
    async getSheets(spreadsheetId) {
        const data = await asyncWrap(
            [ sheets.spreadsheets, 'get' ],
            { auth: this.oauth_client, spreadsheetId }
        );
        return _.map(data.sheets, 'properties.title');
    }

    /**
     * Gets sheet range
     * @param   {Sheet}  spreadsheetId
     * @param   {Sheet}  range
     * @returns {Promise}
     */
    async get(spreadsheetId, range, majorDimension = 'COLUMNS') {
        return await asyncWrap(
            [ sheets.spreadsheets.values, 'get' ],
            { auth: this.oauth_client, spreadsheetId, range, majorDimension }
        );
    }

    /**
     * Gets sheet multiple ranges
     * @param   {Sheet}  spreadsheetId
     * @param   {Sheet}  range
     * @returns {Promise}
     */
    async batchGet(spreadsheetId, ranges, majorDimension = 'COLUMNS') {
        return await asyncWrap(
            [ sheets.spreadsheets.values, 'batchGet' ],
            { auth: this.oauth_client, spreadsheetId, ranges, majorDimension }
        );
    }

    /**
     * Update values for one sheet range
     * @param   {String}    spreadsheetId
     * @param   {String}    range
     * @param   {String[]}  values
     * @returns {Promise}
     */
    async update(spreadsheetId, range, values) {
        return await asyncWrap(
            [ sheets.spreadsheets.values, 'update' ],
            {
                auth: this.oauth_client,
                spreadsheetId,
                range,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [ values ],
                    majorDimension: 'COLUMNS'
                }
            }
        );
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

        return await asyncWrap(
            [ sheets.spreadsheets.values, 'batchUpdate' ],
            {
                auth: this.oauth_client,
                spreadsheetId,
                resource: {
                    valueInputOption: 'USER_ENTERED',
                    data
                }
            }
        );
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
                throw Log.error(e);
        }

        // write the token to the machine
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
    }

    columnToLetter(column) {
        let temp, letter = '';
        while (column > 0) {
            temp = (column - 1) % 26;
            letter = String.fromCharCode(temp + 65) + letter;
            column = (column - temp - 1) / 26;
        }
        return letter;
    }

    letterToColumn(letter) {
        let column = 0, length = letter.length;
        for (let i = 0; i < length; i++)
            column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
        return column;
    }

}

module.exports = Sheets;
