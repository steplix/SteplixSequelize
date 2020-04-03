'use strict';

const P = require('bluebird');
const { Database, Model } = require('../core/steplix');

const defaultOptions = {
    database: 'steplix',
    username: 'root',
    password: '',
    host: 'localhost'
};

let database;
let temp;

afterEach(function (done) {
    if (database) database.connection.close();
    database = null;
    done();
});

describe('Real world', () => {
    it('should return object with tables and models', done => {
        database = new Database(defaultOptions);
        database
            .discover()
            .then(result => {
                expect(result).to.have.property('tables');
                expect(result).to.have.property('models');
                expect(result.models.Users).to.have.property('find');

                return result.models.Users
                    .getOne()
                    .then(user => {
                        expect(user).to.have.property('created_at');
                        expect(user).to.have.property('attributes');
                        expect(user).to.have.property('permissions');
                        return P.resolve(done());
                    });
            })
            .catch(done);
    });

    it('should return unique object with correct properties', done => {
        database = new Database(defaultOptions);
        database
            .discover()
            .then(result => {
                return result.models.Users
                    .getById(1)
                    .then(user => {
                        expect(user).to.have.property('created_at');
                        expect(user).to.have.property('attributes');
                        expect(user).to.have.property('permissions');
                        return P.resolve(done());
                    });
            })
            .catch(done);
    });

    it('should return objects with correct properties', done => {
        database = new Database(defaultOptions);
        database
            .discover()
            .then(result => {
                const options = {
                    limit: 2
                };

                return result.models.Users
                    .find(options)
                    .then(users => {
                        expect(users).to.have.property('length').to.be.a('number');
                        expect(users[0]).to.have.property('created_at');
                        expect(users[0]).to.have.property('attributes');
                        expect(users[0]).to.have.property('permissions');
                        return P.resolve(done());
                    });
            })
            .catch(done);
    });

    it('should return number with the count objects', done => {
        database = new Database(defaultOptions);
        database
            .discover()
            .then(result => {
                return result.models.Users
                    .count()
                    .then(total => {
                        expect(total).to.be.a('number');
                        return P.resolve(done());
                    });
            })
            .catch(done);
    });

    it('should return boolean with object existance result', done => {
        database = new Database(defaultOptions);
        database
            .discover()
            .then(result => {
                const options = {
                    where: {
                        id: 1
                    }
                };

                return result.models.Users
                    .exist(options)
                    .then(exist => {
                        expect(exist).to.be.a('boolean').equal(true);
                        return P.resolve(done());
                    });
            })
            .catch(done);
    });

    it('should create object with correct properties', done => {
        database = new Database(defaultOptions);
        database
            .discover()
            .then(result => {
                const data = {
                    active: 1
                };

                return result.models.Users
                    .create(data)
                    .then(user => {
                        expect(user).to.have.property('active').to.be.a('number').equal(1);
                        expect(user).to.have.property('updated_at').to.be.a('null').equal(null);
                        expect(user).to.have.property('created_at');
                        temp = user;
                        return P.resolve(done());
                    });
            })
            .catch(done);
    });

    it('should update object and your properties', done => {
        database = new Database(defaultOptions);
        database
            .discover()
            .then(result => {
                const data = {
                    active: 0
                };

                return result.models.Users
                    .update(data, temp.id)
                    .then(user => {
                        expect(user).to.have.property('active').to.be.a('number').equal(0);
                        expect(user).to.have.property('updated_at').to.be.a('date');
                        expect(user).to.have.property('created_at');
                        return P.resolve(done());
                    });
            })
            .catch(done);
    });

    it('should destroy object', done => {
        database = new Database(defaultOptions);
        database
            .discover()
            .then(result => {
                return result.models.Users
                    .destroy(temp.id)
                    .then(result => {
                        temp = null;
                        expect(result).to.be.a('number').equal(1);
                        return P.resolve(done());
                    });
            })
            .catch(done);
    });

    it('should transaction found', done => {
        database = new Database(defaultOptions);
        database
            .discover()
            .then(result => {
                const data = {
                    active: 1
                };

                return result.models.Users.transaction(transaction => {
                    return result.models.Users
                        .create(data, { transaction })
                        .then(user => {
                            expect(user).to.have.property('active').to.be.a('number').equal(1);
                            expect(user).to.have.property('updated_at').to.be.a('null').equal(null);
                            expect(user).to.have.property('created_at');

                            temp = user;
                            data.active = 0;

                            return result.models.Users
                                .update(data, temp.id, { transaction })
                                .then(user => {
                                    expect(user).to.have.property('active').to.be.a('number').equal(0);
                                    expect(user).to.have.property('updated_at').to.be.a('date');
                                    expect(user).to.have.property('created_at');

                                    return result.models.Users
                                        .destroy(temp.id, { transaction })
                                        .then(result => {
                                            temp = null;
                                            expect(result).to.be.a('number').equal(1);
                                            return P.resolve(done());
                                        });
                                });
                        });
                });
            })
            .catch(done);
    });

    it('should raw query found', done => {
        database = new Database(defaultOptions);
        database
            .discover()
            .then(result => {
                return result.models.Users
                    .query('SELECT * FROM users')
                    .then(result => {
                        expect(result).to.have.property('length').to.be.a('number');
                        expect(result[0]).to.have.property('active').to.be.a('number').equal(1);
                        expect(result[0]).to.have.property('updated_at').to.be.a('null').equal(null);
                        expect(result[0]).to.have.property('created_at');
                        return P.resolve(done());
                    });
            })
            .catch(done);
    });

    it('should return model only with selected relationships', done => {
        database = new Database(defaultOptions);
        database
            .discover()
            .then(result => {
                expect(result).to.have.property('tables');
                expect(result).to.have.property('models');
                expect(result.models.Users).to.have.property('find');

                return result.models.Users
                    .getOne({
                        tiny: true,
                        with: ['permissions']
                    })
                    .then(user => {
                        expect(user).to.have.property('created_at');
                        expect(user).to.not.have.property('attributes');
                        expect(user).to.have.property('permissions');
                        return P.resolve(done());
                    });
            })
            .catch(done);
    });
});
