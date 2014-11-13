/* https://github.com/adobe/brackets/blob/master/src/extensions/default/JavaScriptQuickEdit/main.js */
/* Used as an example. Kudo's to Adobe for releasing and creating Brackets open-source. */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var MultiRangeInlineEditor  = brackets.getModule("editor/MultiRangeInlineEditor").MultiRangeInlineEditor,
        EditorManager           = brackets.getModule("editor/EditorManager"),
        DocumentManager         = brackets.getModule("document/DocumentManager"),
        JSUtils                 = brackets.getModule("language/JSUtils"),
        PerfUtils               = brackets.getModule("utils/PerfUtils"),
        ProjectManager          = brackets.getModule("project/ProjectManager"),
        Command                 = brackets.getModule('command/CommandManager'),
        Menus                   = brackets.getModule('command/Menus'),
        NativeApp               = brackets.getModule('utils/NativeApp'),
        KOUtils                 = require("KOUtils");
    
    /**
     * Return the selected string.
     */
    function _getComputedName(hostEditor, pos) {
        var A1 = pos.line;
        var A2 = pos.ch;

        var B1 = hostEditor._codeMirror.findWordAt({line: A1, ch: A2}).anchor.ch;
        var B2 = hostEditor._codeMirror.findWordAt({line: A1, ch: A2}).head.ch;

        var computedName = hostEditor._codeMirror.getRange({line: A1,ch: B1}, {line: A1,ch: B2});
        if (computedName.match(/[a-zA-Z]\w+/g)) {
            return computedName;
        } else {
            //Fallback, didn't get computed name, so just get the selection instead.
            return hostEditor._codeMirror.getSelection();
        }
    }
    
    /**
     * @private
     * For unit and performance tests. Allows lookup by function name instead of editor offset
     * without constructing an inline editor.
     *
     * @param {!string} functionName
     * @return {$.Promise} a promise that will be resolved with an array of function offset information
     */
    function _findInProject(functionName) {
        var result = new $.Deferred();
        
        PerfUtils.markStart(PerfUtils.KNOCKOUT_FIND_FUNCTION);
        
        ProjectManager.getAllFiles()
            .done(function (files) {
                KOUtils.findMatchingFunctions(functionName, files, true)
                    .done(function (functions) {
                        PerfUtils.addMeasurement(PerfUtils.KNOCKOUT_FIND_FUNCTION);
                        result.resolve(functions);
                    })
                    .fail(function () {
                        PerfUtils.finalizeMeasurement(PerfUtils.KNOCKOUT_FIND_FUNCTION);
                        result.reject();
                    });
            })
            .fail(function () {
                result.reject();
            });
        
        return result.promise();
    }
    
    /**
     * @private
     * For unit and performance tests. Allows lookup by function name instead of editor offset .
     *
     * @param {!Editor} hostEditor
     * @param {!string} functionName
     * @return {$.Promise} a promise that will be resolved with an InlineWidget
     *      or null if we're not going to provide anything.
     */
    function _createInlineEditor(hostEditor, functionName) {
        // Use Tern jump-to-definition helper, if it's available, to find InlineEditor target.
        var helper = brackets._jsCodeHintsHelper;
        if (helper === null) {
            return null;
        }

        var result = new $.Deferred();
        PerfUtils.markStart(PerfUtils.KNOCKOUT_INLINE_CREATE);

        var response = helper();
        if (response.hasOwnProperty("promise")) {
            response.promise.done(function (jumpResp) {
                //var resolvedPath = jumpResp.fullPath;
//                if (resolvedPath) {
//
//                    // Tern doesn't always return entire function extent.
//                    // Use QuickEdit search now that we know which file to look at.
//                    var fileInfos = [];
//                    fileInfos.push({name: jumpResp.resultFile, fullPath: resolvedPath});
//                    KOUtils.findMatchingFunctions(functionName, fileInfos, true)
//                        .done(function (functions) {
//                            if (functions && functions.length > 0) {
//                                var jsInlineEditor = new MultiRangeInlineEditor(functions);
//                                jsInlineEditor.load(hostEditor);
//                                
//                                PerfUtils.addMeasurement(PerfUtils.KNOCKOUT_INLINE_CREATE);
//                                result.resolve(jsInlineEditor);
//                            } else {
//                                // No matching functions were found
//                                PerfUtils.addMeasurement(PerfUtils.KNOCKOUT_INLINE_CREATE);
//                                result.reject();
//                            }
//                        })
//                        .fail(function () {
//                            PerfUtils.addMeasurement(PerfUtils.KNOCKOUT_INLINE_CREATE);
//                            result.reject();
//                        });
//
//                } else {        // no result from Tern.  Fall back to _findInProject().

                _findInProject(functionName).done(function (functions) {
                    if (functions && functions.length > 0) {
                        var koInlineEditor = new MultiRangeInlineEditor(functions);
                        koInlineEditor.load(hostEditor);
                        
                        PerfUtils.addMeasurement(PerfUtils.KNOCKOUT_INLINE_CREATE);
                        result.resolve(koInlineEditor);
                    } else {
                        // No matching functions were found
                        PerfUtils.addMeasurement(PerfUtils.KNOCKOUT_INLINE_CREATE);
                        result.reject();
                    }
                }).fail(function () {
                    PerfUtils.finalizeMeasurement(PerfUtils.KNOCKOUT_INLINE_CREATE);
                    result.reject();
                });
//                }

            }).fail(function () {
                PerfUtils.finalizeMeasurement(PerfUtils.KNOCKOUT_INLINE_CREATE);
                result.reject();
            });

        }

        return result.promise();
    }
    
    /**
     * This function is registered with EditorManager as an inline editor provider. It creates an inline editor
     * when the cursor is on a ko.computed name, finds all computeds with that name. Only works in .html files!
     *
     * @param {!Editor} editor
     * @param {!{line:Number, ch:Number}} pos
     * @return {$.Promise} a promise that will be resolved with an InlineWidget
     *      or null if we're not going to provide anything.
     */
    function computedProvider(hostEditor, pos) {
        // Only provide a ko.computed editor when cursor is in html content
        if (hostEditor.getModeForSelection() !== "html") {
            return null;
        }
        
        // Only provide ko.computed editor if the selection is within a single line
        var sel = hostEditor.getSelection();
        if (sel.start.line !== sel.end.line) {
            return null;
        }

        // Only works if you select the whole computed name at this very moment.     
        var functionName = _getComputedName(hostEditor, sel.start);
        if (!functionName) {
            return null;
        }

        return _createInlineEditor(hostEditor, functionName);
    }
    
    EditorManager.registerInlineEditProvider(computedProvider);
    PerfUtils.createPerfMeasurement("KNOCKOUT_INLINE_CREATE", "Knockout Inline Editor Creation");
    PerfUtils.createPerfMeasurement("KNOCKOUT_FIND_FUNCTION", "Knockout Find Function");
            
    // for unit tests only
    exports.computedProvider    = computedProvider;
    exports._createInlineEditor = _createInlineEditor;
    exports._findInProject      = _findInProject;
    
    // Adding the icon.
    function open_ko_link() {
        NativeApp.openURLInDefaultBrowser('http://knockoutjs.com/documentation/introduction.html');
    }
    var icon = $("<a href='#'><img title='Knockout.js documentation' src='data:image/png;base64,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'></a>")
        .appendTo($("#main-toolbar .buttons"));

    icon.click(function () {
        open_ko_link()
    });

    var KO_DOC_EXECUTE = 'ko.doc';
    Command.register('KO Doc', KO_DOC_EXECUTE, open_ko_link);

    var menu = Menus.getMenu(Menus.AppMenuBar.FIND_MENU);
    menu.addMenuItem(KO_DOC_EXECUTE, 'Ctrl-Alt-K');
});
