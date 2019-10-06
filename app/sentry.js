const printError = require('../util/printError');
const Sentry = require('@sentry/node');

require('dotenv').config();

class MySentry {

    constructor() {
        try {
            // configure and install raven for sentry
            Sentry.init({ dsn: process.env.SENTRY_DSN });
        }
        catch (ex) {
            printError(ex);
        }
    }

    /**
     * Wrapper for Raven.captureException
     * @param   {Object} err Exception from try/catch
     */
    captureException(err) {
        // print error
        try {
            printError(err);
        }
        catch (ex) {

        }
        // capture the exeption with raven
        Sentry.captureException(err);
    }

    /**
     * Wrapper for Raven.captureBreadcrumb
     * @param   {String} category   The category for Sentry
     * @param   {String} message    Message to display
     * @param   {Object} data       Data object for additional information
     */
    captureBreadcrumb(category, message, data) {
        Sentry.addBreadcrumb({ category, data, message });
    }

    /**
     * Wrapper for Raven.captureMessage
     * @param   {String|Object} message description
     */
    captureMessage(message) {
        Sentry.captureMessage(message);
    }

}

module.exports = new MySentry();
