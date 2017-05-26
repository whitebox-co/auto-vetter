const { createAction } = require('./');
const sleep = require('../util/sleep');

createAction('Google Authentication', async () => {

    await sleep(1000);
    console.log('minty fresh');

});
