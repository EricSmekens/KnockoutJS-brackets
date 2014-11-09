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

    // init
    EditorManager.registerInlineEditProvider(computedProvider);
    PerfUtils.createPerfMeasurement("KNOCKOUT_INLINE_CREATE", "Knockout Inline Editor Creation");
    PerfUtils.createPerfMeasurement("KNOCKOUT_FIND_FUNCTION", "Knockout Find Function");
    
    // for unit tests only
    exports.computedProvider    = computedProvider;
    exports._createInlineEditor = _createInlineEditor;
    exports._findInProject      = _findInProject;
});
