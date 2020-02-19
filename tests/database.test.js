'use strict';

const { Database } = require('../core/steplix');

const DBConfig = {
    host: 'localhost',
    username: 'root',
    password: 'WwFFTRDJ7s2RgPWx',
    database: 'steplix'
};

let db;

describe('Database', () => {
    describe('Instance', () => {
        beforeEach(() => {
            db = new Database(DBConfig);
        });

        afterEach(done => {
            db.end().then(done);
        });

        it('should return all tables on database', done => {
            db
                .query('SHOW TABLES')
                .then(result => {
                    expect(result).to.be.a('array').to.not.be.empty; // eslint-disable-line no-unused-expressions

                    done();
                })
                .catch(done);
        });

        it('should return only one table of database', done => {
            db
                .queryOne('SHOW TABLES')
                .then(result => {
                    expect(result).to.be.a('object').to.have.property(`Tables_in_${DBConfig.database}`);

                    done();
                })
                .catch(done);
        });

        it('should return only one table of database on transaction mode', done => {
            db
                .transaction(transaction => {
                    return db.queryOne('SHOW TABLES', { transaction }).then(result => {
                        expect(result).to.be.a('object').to.have.property(`Tables_in_${DBConfig.database}`);

                        done();
                    });
                })
                .catch(done);
        });

        it('should check if database connection is alive', done => {
            db
                .isAlive()
                .then(result => {
                    expect(result).to.be.a('boolean').equal(true);

                    done();
                })
                .catch(done);
        });

        it('should check if database connection resolve ping', done => {
            db
                .ping()
                .then(result => {
                    expect(result).to.be.a('boolean').equal(true);

                    done();
                })
                .catch(done);
        });
    });
});
