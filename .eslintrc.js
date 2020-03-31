module.exports = {
  env: {
    node: true,
    es6: true,
    jest: true
  },
  extends: [
    "airbnb-base"
  ],
  plugins: ["prettier"],
  rules: {
    "class-methods-use-this": "off",
    "no-plusplus": "off"
  }
};