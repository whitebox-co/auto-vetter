const logUpdate = require('log-update');
const chalk = require('chalk');
const cliSpinners = require('cli-spinners');
const EventEmitter = require('events');
const logSymbols = require('log-symbols');

const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

class Spinner {
    constructor(spinner) {
        this.spinner = spinner;
        this.frame = 0;
        this._override = null;
    }

    start() {
        this.interval = setInterval(() => {
            this._update();
        }, this.spinner.interval);

        return this;
    }

    stop() {
        clearInterval(this.interval);
    }

    succeed() {
        this._override = logSymbols.success;
        this.stop();
    }

    fail() {
        this._override = logSymbols.error;
        this.stop();
    }

    warn() {
        this._override = logSymbols.warn;
        this.stop();
    }

    _update() {
        this.frame = (this.frame + 1) % this.spinner.frames.length;
    }

    toString() {
        if (this._override)
            return this._override;
        return chalk.blue(this.spinner.frames[this.frame]);
    }
}

class Progress {
    constructor(options) {
        this.options = Object.assign({
            tick: 10,
            complete: '=',
            incomplete: '-'
        }, options);

        this.tok = 0;
        this.emitter = new EventEmitter();
    }

    on(event, callback) {
        this.emitter.on(event, callback);
    }

    tick(count = 1) {
        this.tok = clamp(this.tok + count, 0, this.options.tick);

        // we're done now
        if (this.tok == this.options.tick)
            this.done();

        this.emitter.emit('tick', count, this.tok);
    }

    done() {
        this.emitter.emit('done');
    }

    toString() {
        return this.options.complete.repeat(this.tok) + this.options.incomplete.repeat(this.options.tick - this.tok);
    }
}

const bar = new Progress({ complete: chalk.green('='), incomplete: chalk.dim('-') });
const spin = new Spinner(cliSpinners.dots).start();

class Logger {
    constructor(draw) {
        this._stopOnNextRedraw = null;
        this._interval = setInterval(() => {
            draw();
            if (this._stopOnNextRedraw != null) {
                clearInterval(this._interval);
                this._stopOnNextRedraw();
            }
        }, 80);
    }

    stopOnNextRedraw(callback) {
        this._stopOnNextRedraw = callback;
    }
}

let logger = new Logger(() => {
    logUpdate(
        `${spin} [${bar}]
        ${chalk.black('-')} ${logSymbols.success} 100%
        ${chalk.black('-')} ${logSymbols.error} 0%`
    );
});

let ticker = setInterval(() => {
    bar.tick();
}, 200);

bar.on('done', () => {
    spin.succeed();
    clearInterval(ticker);
    logger.stopOnNextRedraw(() => {
        console.log(`  ${logSymbols.info} hi there!`);
    });
});
