'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.changeColumn('Databases', 'app_id', {
      type: Sequelize.INTEGER,
      references: { model: { tableName: 'Apps' }, key: 'id' },
      allowNull: false,
      onDelete: 'CASCADE',
    });
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.changeColumn('Databases', 'app_id', {
      type: Sequelize.INTEGER,
      references: { model: { tableName: 'Apps' }, key: 'id' },
      allowNull: false,
    });
  },
}