'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.changeColumn('Apps', 'title', {
      type: Sequelize.STRING,
      unique: true
    });
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.changeColumn('Apps', 'title', {
      type: Sequelize.STRING,
    });
  }
};
