/* https://github.com/adobe/brackets/blob/master/src/language/JSUtils.js */
/* Used as an example. Kudo's to Adobe for releasing and creating Brackets open-source. */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets */

define(function (require, exports, module) {
    "use strict";
    
    var _ = brackets.getModule("thirdparty/lodash");
    
    // Load brackets modules
    var Async                   = brackets.getModule("utils/Async"),
        DocumentManager         = brackets.getModule("document/DocumentManager"),
        ChangedDocumentTracker  = brackets.getModule("document/ChangedDocumentTracker"),
        EditorManager           = brackets.getModule("editor/EditorManager"),
        FileSystem              = brackets.getModule("filesystem/FileSystem"),
        FileUtils               = brackets.getModule("file/FileUtils"),
        MultiRangeInlineEditor  = brackets.getModule("editor/MultiRangeInlineEditor").MultiRangeInlineEditor,
        ProjectManager          = brackets.getModule("project/ProjectManager"),
        StringUtils             = brackets.getModule("utils/StringUtils"),
        _codeMirror             = brackets.getModule("thirdparty/CodeMirror2/lib/codemirror");

    /**
     * Tracks dirty documents between invocations of findMatchingFunctions.
     * @type {ChangedDocumentTracker}
     */
    var _changedDocumentTracker = new ChangedDocumentTracker();
    
    /**
     * KO computed/observable matching regular expression.
     *
     * Note: KO identifier matching is not strictly to spec. This
     * RegExp matches any sequence of characters that is not whitespace.
     * @type {RegExp}
     */
    var _computedRegExp = /\.([\w]+)(\s)*=(\s)*ko\.computed/g;
    
    /**
     * @private
     * Return an object mapping function name to offset info for all functions in the specified text.
     * Offset info is an array, since multiple functions of the same name can exist.
     * @param {!string} text Document text
     * @return {Object.<string, Array.<{offsetStart: number, offsetEnd: number}>}
     */
    function _findAllFunctionsInText(text) {
        var results = {},
            functionName,
            match;
        
        while ((match = _computedRegExp.exec(text)) !== null) {
            functionName = (match[1] || match[0]).trim();
            
            if (!Array.isArray(results[functionName])) {
                results[functionName] = [];
            }
            
            results[functionName].push({offsetStart: match.index});
        }
        
        return results;
    }
    
    // Given the start offset of a function definition (before the opening brace), find
    // the end offset for the function (the closing "}"). Returns the position one past the
    // close brace. Properly ignores braces inside comments, strings, and regexp literals.
    function _getFunctionEndOffset(text, offsetStart) {
        var mode = _codeMirror.getMode({}, "javascript");
        var state = _codeMirror.startState(mode), stream, style, token;
        var curOffset = offsetStart, length = text.length, blockCount = 0, lineStart;
        var foundStartBrace = false;
        
        // Get a stream for the next line, and update curOffset and lineStart to point to the 
        // beginning of that next line. Returns false if we're at the end of the text.
        function nextLine() {
            if (stream) {
                curOffset++; // account for \n
                if (curOffset >= length) {
                    return false;
                }
            }
            lineStart = curOffset;
            var lineEnd = text.indexOf("\n", lineStart);
            if (lineEnd === -1) {
                lineEnd = length;
            }
            stream = new _codeMirror.StringStream(text.slice(curOffset, lineEnd));
            return true;
        }
        
        // Get the next token, updating the style and token to refer to the current
        // token, and updating the curOffset to point to the end of the token (relative
        // to the start of the original text).
        function nextToken() {
            if (curOffset >= length) {
                return false;
            }
            if (stream) {
                // Set the start of the next token to the current stream position.
                stream.start = stream.pos;
            }
            while (!stream || stream.eol()) {
                if (!nextLine()) {
                    return false;
                }
            }
            style = mode.token(stream, state);
            token = stream.current();
            curOffset = lineStart + stream.pos;
            return true;
        }

        while (nextToken()) {
            if (style !== "comment" && style !== "regexp" && style !== "string") {
                if (token === "{") {
                    foundStartBrace = true;
                    blockCount++;
                } else if (token === "}") {
                    blockCount--;
                }
            }

            // blockCount starts at 0, so we don't want to check if it hits 0
            // again until we've actually gone past the start of the function body.
            if (foundStartBrace && blockCount <= 0) {
                return curOffset;
            }
        }
        
        // Shouldn't get here, but if we do, return the end of the text as the offset.
        return length;
    }

    /**
     * @private
     * Computes function offsetEnd, lineStart and lineEnd. Appends a result record to rangeResults.
     * @param {!Document} doc
     * @param {!string} functionName
     * @param {!Array.<{offsetStart: number, offsetEnd: number}>} functions
     * @param {!Array.<{document: Document, name: string, lineStart: number, lineEnd: number}>} rangeResults
     */
    function _computeOffsets(doc, functionName, functions, rangeResults) {
        var text    = doc.getText(),
            lines   = StringUtils.getLines(text);
        
        functions.forEach(function (funcEntry) {
            if (!funcEntry.offsetEnd) {
                funcEntry.offsetEnd = _getFunctionEndOffset(text, funcEntry.offsetStart);
                funcEntry.lineStart = StringUtils.offsetToLineNum(lines, funcEntry.offsetStart);
                funcEntry.lineEnd   = StringUtils.offsetToLineNum(lines, funcEntry.offsetEnd);
            }
            
            rangeResults.push({
                document:   doc,
                name:       functionName,
                lineStart:  funcEntry.lineStart,
                lineEnd:    funcEntry.lineEnd
            });
        });
    }
    
    /**
     * @private
     * Read a file and build a function list. Result is cached in fileInfo.
     * @param {!FileInfo} fileInfo File to parse
     * @param {!$.Deferred} result Deferred to resolve with all functions found and the document
     */
    function _readFile(fileInfo, result) {
        DocumentManager.getDocumentForPath(fileInfo.fullPath)
            .done(function (doc) {
                var allFunctions = _findAllFunctionsInText(doc.getText());
                
                // Cache the result in the fileInfo object
                fileInfo.JSUtils = {};
                fileInfo.JSUtils.functions = allFunctions;
                fileInfo.JSUtils.timestamp = doc.diskTimestamp;
                
                result.resolve({doc: doc, functions: allFunctions});
            })
            .fail(function (error) {
                result.reject(error);
            });
    }
    
    /**
     * Determines if the document function cache is up to date. 
     * @param {FileInfo} fileInfo
     * @return {$.Promise} A promise resolved with true with true when a function cache is available for the document. Resolves
     *   with false when there is no cache or the cache is stale.
     */
    function _shouldGetFromCache(fileInfo) {
        var result = new $.Deferred(),
            isChanged = _changedDocumentTracker.isPathChanged(fileInfo.fullPath);
        
        if (isChanged && fileInfo.JSUtils) {
            // See if it's dirty and in the working set first
            var doc = DocumentManager.getOpenDocumentForPath(fileInfo.fullPath);
            
            if (doc && doc.isDirty) {
                result.resolve(false);
            } else {
                // If a cache exists, check the timestamp on disk
                var file = FileSystem.getFileForPath(fileInfo.fullPath);
                
                file.stat(function (err, stat) {
                    if (!err) {
                        result.resolve(fileInfo.JSUtils.timestamp.getTime() === stat.mtime.getTime());
                    } else {
                        result.reject(err);
                    }
                });
            }
        } else {
            // Use the cache if the file did not change and the cache exists
            result.resolve(!isChanged && fileInfo.JSUtils);
        }

        return result.promise();
    }
    
    /**
     * @private
     * Compute lineStart and lineEnd for each matched function
     * @param {!Array.<{doc: Document, fileInfo: FileInfo, functions: Array.<offsetStart: number, offsetEnd: number>}>} docEntries
     * @param {!string} functionName
     * @param {!Array.<document: Document, name: string, lineStart: number, lineEnd: number>} rangeResults
     * @return {$.Promise} A promise resolved with an array of document ranges to populate a MultiRangeInlineEditor.
     */
    function _getOffsetsForFunction(docEntries, functionName) {
        // Filter for documents that contain the named function
        var result              = new $.Deferred(),
            matchedDocuments    = [],
            rangeResults        = [];
        
        docEntries.forEach(function (docEntry) {
            // Need to call _.has here since docEntry.functions could have an
            // entry for "hasOwnProperty", which results in an error if trying
            // to invoke docEntry.functions.hasOwnProperty().
            if (_.has(docEntry.functions, functionName)) {
                var functionsInDocument = docEntry.functions[functionName];
                matchedDocuments.push({doc: docEntry.doc, fileInfo: docEntry.fileInfo, functions: functionsInDocument});
            }
        });
        
        Async.doInParallel(matchedDocuments, function (docEntry) {
            var doc         = docEntry.doc,
                oneResult   = new $.Deferred();
            
            // doc will be undefined if we hit the cache
            if (!doc) {
                DocumentManager.getDocumentForPath(docEntry.fileInfo.fullPath)
                    .done(function (fetchedDoc) {
                        _computeOffsets(fetchedDoc, functionName, docEntry.functions, rangeResults);
                    })
                    .always(function () {
                        oneResult.resolve();
                    });
            } else {
                _computeOffsets(doc, functionName, docEntry.functions, rangeResults);
                oneResult.resolve();
            }
            
            return oneResult.promise();
        }).done(function () {
            result.resolve(rangeResults);
        });
        
        return result.promise();
    }
    
    /**
     * Resolves with a record containing the Document or FileInfo and an Array of all
     * function names with offsets for the specified file. Results may be cached.
     * @param {FileInfo} fileInfo
     * @return {$.Promise} A promise resolved with a document info object that
     *   contains a map of all function names from the document and each function's start offset. 
     */
    function _getFunctionsForFile(fileInfo) {
        var result = new $.Deferred();
            
        _shouldGetFromCache(fileInfo)
            .done(function (useCache) {
                if (useCache) {
                    // Return cached data. doc property is undefined since we hit the cache.
                    // _getOffsets() will fetch the Document if necessary.
                    result.resolve({/*doc: undefined,*/fileInfo: fileInfo, functions: fileInfo.JSUtils.functions});
                } else {
                    _readFile(fileInfo, result);
                }
            }).fail(function (err) {
                result.reject(err);
            });
        
        return result.promise();
    }
    
    /**
     * @private
     * Get all functions for each FileInfo.
     * @param {Array.<FileInfo>} fileInfos
     * @return {$.Promise} A promise resolved with an array of document info objects that each
     *   contain a map of all function names from the document and each function's start offset.
     */
    function _getFunctionsInFiles(fileInfos) {
        var result          = new $.Deferred(),
            docEntries      = [];
        
        Async.doInParallel(fileInfos, function (fileInfo) {
            var oneResult = new $.Deferred();
            
            _getFunctionsForFile(fileInfo)
                .done(function (docInfo) {
                    docEntries.push(docInfo);
                })
                .always(function (error) {
                    // If one file fails, continue to search
                    oneResult.resolve();
                });
            
            return oneResult.promise();
        }).always(function () {
            // Reset ChangedDocumentTracker now that the cache is up to date.
            _changedDocumentTracker.reset();
            
            result.resolve(docEntries);
        });
        
        return result.promise();
    }
    
    /**
     * @private
     * Return all functions that have the specified name, searching across all the given files.
     *
     * @param {!String} functionName The name to match.
     * @param {!Array.<File>} fileInfos The array of files to search.
     * @param {boolean=} keepAllFiles If true, don't ignore non-javascript files.
     * @return {$.Promise} that will be resolved with an Array of objects containing the
     *      source document, start line, and end line (0-based, inclusive range) for each matching function list.
     *      Does not addRef() the documents returned in the array.
     */
    function findMatchingFunctions(functionName, fileInfos, keepAllFiles) {
        var result          = new $.Deferred(),
            jsFiles         = [],
            docEntries      = [];
        
        if (!keepAllFiles) {
            // Filter fileInfos for .js files
            jsFiles = fileInfos.filter(function (fileInfo) {
                return FileUtils.getFileExtension(fileInfo.fullPath).toLowerCase() === "js";
            });
        } else {
            jsFiles = fileInfos;
        }
        
        // RegExp search (or cache lookup) for all functions in the project
        _getFunctionsInFiles(jsFiles).done(function (docEntries) {
            // Compute offsets for all matched functions
            _getOffsetsForFunction(docEntries, functionName).done(function (rangeResults) {
                result.resolve(rangeResults);
            });
        });
        
        return result.promise();
    }
    
    /**
     * Return the computed name based on where the cursor is, or what text is selected.
     * @param {!Editor} editor
     * @param {!{line:Number, ch:Number}} pos
     * @return {!string} name of ko.computed.
     */
    function _getComputedName(hostEditor, pos) {
        var A1 = pos.line;
        var A2 = pos.ch;

        var B1 = hostEditor._codeMirror.findWordAt({line: A1, ch: A2}).anchor.ch;
        var B2 = hostEditor._codeMirror.findWordAt({line: A1, ch: A2}).head.ch;

        var computedName = hostEditor._codeMirror.getRange({line: A1, ch: B1}, {line: A1, ch: B2});
        if (computedName.match(/[a-zA-Z]\w+/g)) {
            return computedName;
        } else {
            //Fallback, didn't get computed name, so just get the selection instead.
            return hostEditor._codeMirror.getSelection();
        }
    }
    
    /**
     * @private
     * Allows lookup by function name instead of editor offset
     * without constructing an inline editor.
     *
     * @param {!string} functionName
     * @return {$.Promise} a promise that will be resolved with an array of function offset information
     */
    function _findInProject(functionName) {
        var result = new $.Deferred();
        
        ProjectManager.getAllFiles()
            .done(function (files) {
                findMatchingFunctions(functionName, files, true)
                    .done(function (functions) {
                        result.resolve(functions);
                    })
                    .fail(function () {
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
     * Allows lookup by function name instead of editor offset .
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

        var response = helper();
        if (response.hasOwnProperty("promise")) {
            response.promise.done(function (jumpResp) {
                _findInProject(functionName).done(function (functions) {
                    if (functions && functions.length > 0) {
                        var koInlineEditor = new MultiRangeInlineEditor(functions);
                        koInlineEditor.load(hostEditor);
                        result.resolve(koInlineEditor);
                    } else {
                        // No matching functions were found
                        result.reject();
                    }
                }).fail(function () {
                    result.reject();
                });

            }).fail(function () {
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
    function initQuickEdit() {
        EditorManager.registerInlineEditProvider(computedProvider);
    }
    
    exports.initKOQuickEdit = initQuickEdit;
});