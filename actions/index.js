const path = require('path');
const fs = require('fs');
const _ = require('lodash');

// array of actions to use
const actions = [];

/**
 * Used to create an action for the startup script
 * @param   {String}    text
 * @param   {Function}  func
 * @returns {Function}  Returns the function passed as a parameter
 */
const createAction = (text, func) => {
    if (!_.isString(text))
        throw Error('Parameter not a string!');
    if (!_.isFunction(func))
        throw Error('Parameter not a function!');
    actions.push({ text, func });
    return func;
}

/**
 * Gets an array of all the action text fields
 * @returns {String[]}
 */
const getActions = () => {
    return _.map(actions, 'text');
}

/**
 * Runs the action of the given text field or false on failure
 * @param   {String}    text
 * @param   {Object}    args
 * @returns {Promise|false}
 */
const runAction = async (text, args = undefined) => {
    const index = getActions().indexOf(text);
    if (index != -1)
        return await actions[index].func(args);
    throw new Error(`No such action '${text}'`);
}

module.exports = { createAction, getActions, runAction };

// require all the actions in this folder
fs.readdirSync(__dirname).forEach(file => {
    require('./' + file);
});
