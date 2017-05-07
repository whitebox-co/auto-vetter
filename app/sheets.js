/**
 * sheets.js
 * This file handles the Google Sheets API
 *
 * @author James Stine <Leon.Blade@gmail.com>
 */

const google = require('googleapis');
const sheets = google.sheets('v4');
const googleAuth = require('google-auth-library');
const authServer = require('../util/authServer');
const Log = require('../util/log');
const asyncWrap = require('../util/asyncWrap');

const SCOPES = [ 'https://www.googleapis.com/auth/spreadsheets.readonly' ];

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
    async authenticate(token = null) {
        // create instance of Google Auth
        const auth = new googleAuth();

        // create a new oauth client
        this.oauth_client = new auth.OAuth2(
            this.client_id,
            this.client_secret,
            'http://localhost:8080/callback'
        );

        // get an access token if we don't have one passed in
        if (token == null)
            token = await this.getAccessToken(this.oauth_client);

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

        // return the token details
        return token;
    }

    /**
     * Gets sheet range
     * @param   {Sheet}  spreadsheetId
     * @param   {Sheet}  range
     * @returns {Promise}
     */
    async getSheetRange(spreadsheetId, range) {
        return await asyncWrap(
            [ sheets.spreadsheets.values, 'get' ],
            { auth: this.oauth_client, spreadsheetId, range }
        );
    }

}

module.exports = Sheets;
