'use strict';
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    firstName: DataTypes.STRING,
    lastName: DataTypes.STRING,
    username: {
      type: DataTypes.STRING,
      unique: { args: true, msg: 'Email is already registered', },
      validate: {
        isEmail: {
          args: true,
          msg: 'Please enter a valid email',
        },
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: {
          args: 5,
          msg: 'Password must be between 5 and 50 characters',
        }
      }
    }
  }, {});
  User.associate = function(models) {
    // associations can be defined here
  };
  return User;
};
