'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.removeConstraint(
      'Databases', 
      'Databases_app_id_fkey'
    );
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.addConstraint(
      'Databases',
      ['app_id'],
      {   
        type: 'foreign key',
        name: 'Databases_app_id_fkey',
        references: { model: { tableName: 'Apps' }, key: 'id' },
      }
    );
  },
};
