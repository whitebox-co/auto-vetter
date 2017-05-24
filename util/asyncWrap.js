/**
 * asyncWrap.js
 * The purpose of this file is to hold one function which can wrap a normal call
 * with an async callback method passed into the arguments compliant with
 * async/await to avoid dealing with promises.  For the sake of this program
 * the callback arguments are assumed to be a standard of error and then data.
 * If there are more arguments then it will shim off the initial argument as
 * error and return the rest in the resolve.
 *
 * @author James Stine <Leon.Blade@gmail.com>
 */

module.exports = async (fn, ...args) => {
    return new Promise((resolve, reject) => {
        try {
            args.push((err, val) => {
                if (err)
                    return reject(err);
                return resolve(val);
            });
            let thisArg = this;
            if (Array.isArray(fn))
                thisArg = fn.shift();
            thisArg[fn].apply(thisArg, args);
        }
        catch (ex) {
            reject(ex);
        }
    });
}
