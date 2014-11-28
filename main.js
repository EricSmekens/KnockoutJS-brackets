/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var PreferencesManager      = brackets.getModule('preferences/PreferencesManager'),
        KOMenu                  = require("KOMenu"),
        KOQuickEdit             = require("KOQuickEdit"),
        KOCodeHints             = require("KOCodeHints");
    
    /**
     * Get preferences.
     */
    var koJsPreferences = PreferencesManager.getExtensionPrefs("ericsmekens.knockoutjs");
    var showKOIcon = koJsPreferences.get('show_icon');
    if (showKOIcon === undefined) {
        showKOIcon = true;
        koJsPreferences.set('show_icon', true);
        koJsPreferences.save();
    }
    var useKOCodeHint = koJsPreferences.get('code_hint');
    if (useKOCodeHint === undefined) {
        useKOCodeHint = true;
        koJsPreferences.set('code_hint', true);
        koJsPreferences.save();
    }
    var useKOQuickEdit = koJsPreferences.get('quick_edit');
    if (useKOQuickEdit === undefined) {
        useKOQuickEdit = true;
        koJsPreferences.set('quick_edit', true);
        koJsPreferences.save();
    }

    // Adding menu/side-icon
    if (showKOIcon) {
        KOMenu.initKOMenu();
    }
    
    //Register CodeHinter for data-bind in html.
    if (useKOCodeHint) {
        KOCodeHints.initKOCodeHinter();
    }
    //Register quick-edit for ko.computeds.
    if (useKOQuickEdit) {
        KOQuickEdit.initKOQuickEdit();
    }
});