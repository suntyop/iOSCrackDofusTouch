window.CordovaFileSystem = (function () {
	/**
	 * Static Private functions
	 */

	/* createDir, recursively */
	function __createDir(rootDirEntry, folders, success, error) {
		rootDirEntry.getDirectory(folders[0], { create: true }, function (dirEntry) {
			// Recursively add the new subfolder (if we still have another to create).
			if (folders.length > 1) {
				__createDir(dirEntry, folders.slice(1), success, error);
			} else {
				success(dirEntry);
			}
		}, error);
	}

	function dirname(str) {
		str = str.substr(0, str.lastIndexOf('/') + 1);
		if (str[0] === '/') {
			str = str.substr(1);
		}
		return str;
	}

	function filename(str) {
		return str.substr(str.lastIndexOf('/') + 1);
	}

	function normalize(str) {
		str = str || '';
		if (str[0] === '/') {
			str = str.substr(1);
		}
		if (!!str && str.indexOf('.') < 0 && str[str.length - 1] !== '/') {
			str += '/';
		}
		if (str === './') {
			str = '';
		}
		return str;
	}

	var transferQueue = [], // queued fileTransfers
		inprogress = 0;     // currently active filetransfers

	/**
	 * Factory function: Create a single instance (based on single FileSystem)
	 */
	function FileSystem(options) {
		/* Promise implementation */
		options = options || {};
		var Promise = options.Promise || window.Promise;
		if (typeof Promise === 'undefined') {
			throw new Error('No Promise library given in options.Promise');
		}

		/* default options */
		this.options = options = options || {};
		options.persistent = options.persistent !== undefined ? options.persistent : true;
		options.storageSize = options.storageSize || 20 * 1024 * 1024;
		options.concurrency = options.concurrency || 3;
		options.retry = options.retry || [];

		/* Cordova deviceready promise */
		var deviceready = new Promise(function (resolve, reject) {
			document.addEventListener('deviceready', resolve, false);
			setTimeout(function () {
				reject(new Error('deviceready has not fired after 5 seconds.'));
			}, 5100);
		});


		/* Promise resolve helper */
		function resolvedPromise(value) {
			return new Promise(function (resolve) {
				return resolve(value);
			});
		}

		/* the filesystem! */
		var fs = new Promise(function (resolve, reject) {
			deviceready.then(function () {
				var type = options.persistent ? 1 : 0;
				if (typeof options.fileSystem === 'number') {
					type = options.fileSystem;
				}
				window.requestFileSystem(type, options.storageSize, resolve, reject);
				setTimeout(function () {
					reject(new Error('Could not retrieve FileSystem after 5 seconds.'));
				}, 5100);
			}, reject);
		});

		/* debug */
		fs.then(function (fs) {
			window.__fs = fs;
		}, function (err) {
			console.error('Could not get Cordova FileSystem:', err);
		});

		/* ensure directory exists */
		function ensure(folders) {
			return new Promise(function (resolve, reject) {
				return fs.then(function (fs) {
					if (!folders) {
						resolve(fs.root);
					} else {
						folders = folders.split('/').filter(function (folder) {
							return folder && folder.length > 0 && folder !== '.' && folder !== '..';
						});
						__createDir(fs.root, folders, resolve, reject);
					}
				}, reject);
			});
		}

		/* get file file */
		function file(path, options) {
			return new Promise(function (resolve, reject) {
				if (typeof path === 'object') {
					return resolve(path);
				}
				path = normalize(path);
				options = options || {};
				return fs.then(function (fs) {
					fs.root.getFile(path, options, resolve, reject);
				}, reject);
			});
		}

		/* get directory entry */
		function dir(path, options) {
			path = normalize(path);
			options = options || {};
			return new Promise(function (resolve, reject) {
				return fs.then(function (fs) {
					if (!path || path === '/') {
						resolve(fs.root);
					} else {
						fs.root.getDirectory(path, options, resolve, reject);
					}
				}, reject);
			});
		}

		/* list contents of a directory */
		function list(path, mode) {
			mode = mode || '';
			var recursive = mode.indexOf('r') > -1;
			var getAsEntries = mode.indexOf('e') > -1;
			var onlyFiles = mode.indexOf('f') > -1;
			var onlyDirs = mode.indexOf('d') > -1;
			if (onlyFiles && onlyDirs) {
				onlyFiles = false;
				onlyDirs = false;
			}

			return new Promise(function (resolve, reject) {
				return dir(path).then(function (dirEntry) {
					var dirReader = dirEntry.createReader();
					dirReader.readEntries(function (entries) {
						var promises = [resolvedPromise(entries)];
						if (recursive) {
							entries
								.filter(function (entry) {
									return entry.isDirectory;
								})
								.forEach(function (entry) {
									promises.push(list(entry.fullPath, 're'));
								});
						}
						Promise.all(promises).then(function (values) {
							var entries = [];
							entries = entries.concat.apply(entries, values);
							if (onlyFiles) {
								entries = entries.filter(function (entry) {
									return entry.isFile;
								});
							}
							if (onlyDirs) {
								entries = entries.filter(function (entry) {
									return entry.isDirectory;
								});
							}
							if (!getAsEntries) {
								entries = entries.map(function (entry) {
									return entry.fullPath;
								});
							}
							resolve(entries);
						}, reject);
					}, reject);
				}, reject);
			});
		}

		/* does file exist? If so, resolve with fileEntry, if not, resolve with false. */
		function exists(path) {
			return new Promise(function (resolve, reject) {
				file(path).then(
					function (fileEntry) {
						resolve(fileEntry);
					},
					function (err) {
						if (err.code === 1) {
							resolve(false);
						} else {
							reject(err);
						}
					}
				);
			});
		}

		function create(path) {
			return ensure(dirname(path)).then(function () {
				return file(path, { create: true });
			});
		}

		/* convert path to URL to be used in JS/CSS/HTML */
		function toURL(path) {
			return file(path).then(function (fileEntry) {
				return fileEntry.toURL();
			});
		}

		/* synchronous helper to get internal URL. */
		function toInternalURLSync(path) {
			path = normalize(path);
			var localPath = 'cdvfile://localhost/' + (options.persistent ? 'persistent/' : 'temporary/') + path;
			return path.indexOf('://') < 0 ? localPath : path;
		}

		function toInternalURL(path) {
			return file(path).then(function (fileEntry) {
				return fileEntry.toInternalURL();
			});
		}


		/* return contents of a file */
		function read(path, method) {
			method = method || 'readAsText';
			return file(path).then(function (fileEntry) {
				return new Promise(function (resolve, reject) {
					fileEntry.file(function (file) {
						var reader = new FileReader();
						reader.onloadend = function () {
							resolve(this.result);
						};
						reader[method](file);
					}, reject);
				});
			});
		}

		/* convert path to base64 date URI */
		function toDataURL(path) {
			return read(path, 'readAsDataURL');
		}


		function readJSON(path) {
			return read(path).then(JSON.parse);
		}

		/* write contents to a file */
		function write(path, blob, mimeType) {
			return ensure(dirname(path))
				.then(function () {
					return file(path, { create: true });
				})
				.then(function (fileEntry) {
					return new Promise(function (resolve, reject) {
						fileEntry.createWriter(function (writer) {
							writer.onwriteend = resolve;
							writer.onerror = reject;
							if (typeof blob === 'string') {
								blob = new Blob([blob], { type: mimeType || 'text/plain' });
							} else if (blob instanceof Blob !== true) {
								blob = new Blob([JSON.stringify(blob)], { type: mimeType || 'application/json' });
							}
							writer.write(blob);
						}, reject);
					});
				});
		}

		/* move a file */
		function move(src, dest) {
			return ensure(dirname(dest))
				.then(function (dir) {
					return file(src).then(function (fileEntry) {
						return new Promise(function (resolve, reject) {
							fileEntry.moveTo(dir, filename(dest), resolve, reject);
						});
					});
				});
		}

		/* copy a file */
		function copy(src, dest) {
			return ensure(dirname(dest))
				.then(function (dir) {
					return file(src).then(function (fileEntry) {
						return new Promise(function (resolve, reject) {
							fileEntry.copyTo(dir, filename(dest), resolve, reject);
						});
					});
				});
		}

		/* delete a file */
		function remove(path, mustExist) {
			var method = mustExist ? file : exists;
			return new Promise(function (resolve, reject) {
				method(path).then(function (fileEntry) {
					if (fileEntry !== false) {
						fileEntry.remove(resolve, reject);
					} else {
						resolve(1);
					}
				}, reject);
			}).then(function (val) {
					return val === 1 ? false : true;
				});
		}

		/* delete a directory */
		function removeDir(path) {
			return dir(path).then(function (dirEntry) {
				return new Promise(function (resolve, reject) {
					dirEntry.removeRecursively(resolve, reject);
				});
			});
		}

		// Whenever we want to start a transfer, we call popTransferQueue
		function popTransferQueue(ft, isDownload, serverUrl, localPath, win, fail, trustAllHosts, transferOptions) {
			trustAllHosts = trustAllHosts || false;

			if (ft._aborted) {
				inprogress--;
			} else if (isDownload) {
				ft.download.call(ft, serverUrl, localPath, win, fail, trustAllHosts, transferOptions);
				if (ft.onprogress) {
					ft.onprogress(new ProgressEvent());
				}
			} else {
				ft.upload.call(ft, localPath, serverUrl, win, fail, transferOptions, trustAllHosts);
			}
		}

		// Promise callback to check if there are any more queued transfers
		function nextTransfer(result) {
			inprogress--; // decrement counter to free up one space to start transfers again!

			// while we are not at max concurrency
			while (transferQueue.length > 0 && inprogress < options.concurrency) {
				// increment activity counter
				inprogress++;
				// check if there are any queued transfers
				popTransferQueue.apply(null, transferQueue.pop());
			}
			// if we are at max concurrency, popTransferQueue() will be called whenever
			// the transfer is ready and there is space available.

			return result;
		}

		function filetransfer(isDownload, serverUrl, localPath, transferOptions, onprogress) {
			if (typeof transferOptions === 'function') {
				onprogress = transferOptions;
				transferOptions = {};
			}
			if (localPath.indexOf('://') < 0) {
				localPath = toInternalURLSync(localPath);
			}

			transferOptions = transferOptions || {};
			if (!transferOptions.retry || !transferOptions.retry.length) {
				transferOptions.retry = options.retry;
			}
			transferOptions.retry = transferOptions.retry.concat();
			if (!transferOptions.file && !isDownload) {
				transferOptions.fileName = filename(localPath);
			}

			var ft = new FileTransfer();
			onprogress = onprogress || transferOptions.onprogress;
			if (typeof onprogress === 'function') {
				ft.onprogress = onprogress;
			}
			var promise = new Promise(function (resolve, reject) {
				var attempt = function (err) {
					if (transferOptions.retry.length === 0) {
						reject(err);
					} else {
						transferQueue.reverse();
						transferQueue.push([
							ft,
							isDownload,
							serverUrl,
							localPath,
							resolve,
							attempt,
							transferOptions.trustAllHosts,
							transferOptions
						]);
						transferQueue.reverse();
						var timeout = transferOptions.retry.shift();
						if (timeout > 0) {
							setTimeout(nextTransfer, timeout);
						} else {
							nextTransfer();
						}
					}
				};
				transferOptions.retry.unshift(0);
				inprogress++;
				attempt();
			});
			promise.then(nextTransfer, nextTransfer);
			promise.progress = function (onprogress) {
				ft.onprogress = onprogress;
				return promise;
			};
			promise.abort = function () {
				ft._aborted = true;
				ft.abort();
				return promise;
			};
			return promise;
		}

		function download(url, dest, options, onprogress) {
			return filetransfer(true, url, dest, options, onprogress);
		}

		function upload(source, dest, options, onprogress) {
			return filetransfer(false, dest, source, options, onprogress);
		}

		return {
			fs: fs,
			normalize: normalize,
			file: file,
			filename: filename,
			dir: dir,
			dirname: dirname,
			create: create,
			read: read,
			readJSON: readJSON,
			write: write,
			move: move,
			copy: copy,
			remove: remove,
			removeDir: removeDir,
			list: list,
			ensure: ensure,
			exists: exists,
			download: download,
			upload: upload,
			toURL: toURL,
			toInternalURLSync: toInternalURLSync,
			toInternalURL: toInternalURL,
			toDataURL: toDataURL,
			deviceready: deviceready,
			options: options,
			Promise: Promise
		};
	}

	return FileSystem;
}());