const ora = require('ora');

const queue = [];
const tagQueue = {};
let mu;


class Muda {

    static ora(options, tag = undefined) {
        if (tag == undefined)
            queue.push(ora(options).start());
        else
            tagQueue[tag] = ora(options).start();
    }

    static da(tag = undefined) {
        if (tag == undefined)
            return queue[queue.length - 1];
        return tagQueue[tag];
    }

}

module.exports = Muda;
