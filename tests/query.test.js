'use strict';

const snakeCase = require('lodash/snakeCase');
const { Query } = require('../core/steplix');

describe('Query', () => {
    describe('Builder', () => {
        describe('#select', () => {
            it('should return simple SQL', done => {
                const result = Query.select('users', {
                    where: {
                        deleted_at: {
                            IS: Query.literal('NULL')
                        }
                    }
                });

                expect(result).to.be.a('string');
                expect(result).equal('SELECT * FROM users WHERE deleted_at IS NULL');

                done();
            });

            it('should return complex SQL', done => {
                const result = Query.select('users', {
                    where: {
                        id: 1,
                        deleted_at: {
                            IS: Query.literal('NULL')
                        }
                    }
                });

                expect(result).to.be.a('string');
                expect(result).equal('SELECT * FROM users WHERE id = 1 AND deleted_at IS NULL');

                done();
            });

            it('should return very complex SQL', done => {
                const result = Query.select('users', {
                    where: {
                        id: [1, 2, 3],
                        OR: {
                            created_at: {
                                '>': '1980-01-01 00:00:00',
                                '<': '2000-01-01 00:00:00'
                            }
                        }
                    }
                });

                expect(result).to.be.a('string');
                expect(result).equal('SELECT * FROM users WHERE id IN (1,2,3) AND (created_at > \'1980-01-01 00:00:00\' OR created_at < \'2000-01-01 00:00:00\')');

                done();
            });

            it('should return very very complex SQL', done => {
                const result = Query.select('users', {
                    join: [
                        {
                            type: 'LEFT',
                            table: 'user_types',
                            on: {
                                'user.id': 'user_types.id'
                            }
                        }
                    ],
                    where: {
                        id: [1, 2, 3],
                        OR: {
                            created_at: {
                                BETWEEN: ['1980-01-01 00:00:00', '2000-01-01 00:00:00']
                            }
                        }
                    },
                    order: [['id', 'DESC']]
                });

                expect(result).to.be.a('string');
                expect(result).equal('SELECT * FROM users LEFT JOIN user_types ON user.id = user_types.id WHERE id IN (1,2,3) AND (created_at BETWEEN \'1980-01-01 00:00:00\' AND \'2000-01-01 00:00:00\') ORDER BY id DESC');

                done();
            });
        });

        describe('#insert', () => {
            it('should return simple SQL', done => {
                const result = Query.insert('users', {
                    id: Query.literal('NULL'),
                    first_name: 'Nicolas',
                    last_name: 'Molina',
                    age: 31,
                    created_at: Query.literal('NOW()'),
                    updated_at: Query.literal('NULL'),
                    deleted_at: Query.literal('NULL')
                });

                expect(result).to.be.a('string');
                expect(result).equal('INSERT INTO users (id, first_name, last_name, age, created_at, updated_at, deleted_at) VALUES (NULL, \'Nicolas\', \'Molina\', 31, NOW(), NULL, NULL)');

                done();
            });

            it('should return complex SQL', done => {
                const result = Query.insert('users', {
                    id: Query.literal('NULL'),
                    firstName: 'Nicolas',
                    lastName: 'Molina',
                    age: 31,
                    createdAt: Query.literal('NOW()'),
                    updatedAt: Query.literal('NULL'),
                    deletedAt: Query.literal('NULL')
                }, {
                    keyParser: snakeCase
                });

                expect(result).to.be.a('string');
                expect(result).equal('INSERT INTO users (id, first_name, last_name, age, created_at, updated_at, deleted_at) VALUES (NULL, \'Nicolas\', \'Molina\', 31, NOW(), NULL, NULL)');

                done();
            });
        });

        describe('#inserts', () => {
            it('should return simple SQL', done => {
                const result = Query.inserts('users', [
                    {
                        id: Query.literal('NULL'),
                        first_name: 'Nicolas',
                        last_name: 'Molina',
                        age: 31,
                        created_at: Query.literal('NOW()'),
                        updated_at: Query.literal('NULL'),
                        deleted_at: Query.literal('NULL')
                    }, {
                        id: Query.literal('NULL'),
                        first_name: 'Gonzalo',
                        last_name: 'Aizpun',
                        age: 34,
                        created_at: Query.literal('NOW()'),
                        updated_at: Query.literal('NULL'),
                        deleted_at: Query.literal('NULL')
                    }
                ]);

                expect(result).to.be.a('string');
                expect(result).equal('INSERT INTO users (id, first_name, last_name, age, created_at, updated_at, deleted_at) VALUES (NULL, \'Nicolas\', \'Molina\', 31, NOW(), NULL, NULL), (NULL, \'Gonzalo\', \'Aizpun\', 34, NOW(), NULL, NULL)');

                done();
            });

            it('should return complex SQL', done => {
                const result = Query.inserts('users', [
                    {
                        id: Query.literal('NULL'),
                        firstName: 'Nicolas',
                        lastName: 'Molina',
                        age: 31,
                        createdAt: Query.literal('NOW()'),
                        updatedAt: Query.literal('NULL'),
                        deletedAt: Query.literal('NULL')
                    }, {
                        id: Query.literal('NULL'),
                        firstName: 'Gonzalo',
                        lastName: 'Aizpun',
                        age: 34,
                        createdAt: Query.literal('NOW()'),
                        updatedAt: Query.literal('NULL'),
                        deletedAt: Query.literal('NULL')
                    }
                ], {
                    keyParser: snakeCase
                });

                expect(result).to.be.a('string');
                expect(result).equal('INSERT INTO users (id, first_name, last_name, age, created_at, updated_at, deleted_at) VALUES (NULL, \'Nicolas\', \'Molina\', 31, NOW(), NULL, NULL), (NULL, \'Gonzalo\', \'Aizpun\', 34, NOW(), NULL, NULL)');

                done();
            });
        });

        describe('#update', () => {
            it('should return simple SQL', done => {
                const data = {
                    first_name: 'Nicolás',
                    updated_at: Query.literal('NOW()')
                };

                const result = Query.update('users', data, {
                    where: {
                        id: 1
                    }
                });

                expect(result).to.be.a('string');
                expect(result).equal('UPDATE users SET first_name = \'Nicolás\', updated_at = NOW() WHERE id = 1');

                done();
            });

            it('should return complex SQL', done => {
                const data = {
                    first_name: 'Nicolás',
                    updated_at: Query.literal('NOW()')
                };

                const result = Query.update('users', data);

                expect(result).to.be.a('string');
                expect(result).equal('UPDATE users SET first_name = \'Nicolás\', updated_at = NOW()');

                done();
            });

            it('should return very complex SQL', done => {
                const data = {
                    first_name: 'Nicolás',
                    updated_at: Query.literal('NOW()')
                };

                const result = Query.update('users', data, {
                    where: {
                        id: [1, 2, 3],
                        deleted_at: {
                            IS: Query.literal('NULL')
                        }
                    }
                });

                expect(result).to.be.a('string');
                expect(result).equal('UPDATE users SET first_name = \'Nicolás\', updated_at = NOW() WHERE id IN (1,2,3) AND deleted_at IS NULL');

                done();
            });
        });
    });
});
