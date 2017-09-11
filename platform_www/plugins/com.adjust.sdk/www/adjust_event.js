cordova.define("com.adjust.sdk.AdjustEvent", function(require, exports, module) {
function AdjustEvent(eventToken) {
    // iOS & Android
    this.eventToken = eventToken;

    this.revenue = null;
    this.currency = null;
    this.transactionId = null;

    this.callbackParameters = [];
    this.partnerParameters = [];

    // iOS only
    this.receipt = null;
    this.isReceiptSet = false;
}

AdjustEvent.prototype.setRevenue = function(revenue, currency) {
    this.revenue = revenue;
    this.currency = currency;
};

AdjustEvent.prototype.addCallbackParameter = function(key, value) {
    this.callbackParameters.push(key);
    this.callbackParameters.push(value);
};

AdjustEvent.prototype.addPartnerParameter = function(key, value) {
    this.partnerParameters.push(key);
    this.partnerParameters.push(value);
};

AdjustEvent.prototype.setTransactionId = function(transactionId) {
    this.transactionId = transactionId;
}

// @deprecated
AdjustEvent.prototype.setReceiptForTransactionId = function(receipt, transactionId) {
    console.warn("Calling deprecated function! Use Cordova purchase SDK for this purpose.");
    console.warn("For more info, visit https://github.com/adjust/cordova_purchase_sdk");

    this.receipt = receipt;
    this.transactionId = transactionId;
    this.isReceiptSet = true;
}

module.exports = AdjustEvent;

});
