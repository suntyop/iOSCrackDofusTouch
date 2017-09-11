(function (cordova) {
	var head = document.getElementsByTagName('head')[0];
	var now = Date.now();

	var loader;
	var assetLoader;
	var prefs;
	var isLoaded = false;
	var splashscreen;
	var currentServer;
	var defaultServer;

	function resetServer() {
		// TODO: show a proper page (html or image)
		var errorMsg = 'Server cannot be reached.';
		if (window.navigator.connection.type === Connection.NONE || !window.navigator.onLine) {
			errorMsg += ' Check your internet connection.';
		}
		if (defaultServer !== currentServer) {
			errorMsg += ' Rolling back to default.';
			prefs.store('server', '');
		}
		setTimeout(function () {
			window.navigator.notification.alert(errorMsg, function () {
				loader.reset();
			}, window.APPLICATION_NAME_DISPLAY, "Ok");
		}, 0);
	}

	// Load Files
	function loadFile(src, id) {
		if (!src) {
			return;
		}
		id = 'source_' + id;
		var el;
		var hasSource = document.getElementById(id);
		if (hasSource) {
			// prevent to load multiple time the same source
			return;
		}
		// Load javascript
		if (src.substr(-3) === '.js') {
			el = document.createElement('script');
			el.type = 'text/javascript';
			el.src = src + '?' + now;
			el.async = false;
			// Load CSS
		} else if (src.substr(-4) === '.css') {
			el = document.createElement('link');
			el.rel = 'stylesheet';
			el.href = src + '?' + now;
			el.type = 'text/css';
		} else {
			console.error('Format not handled', src);
		}
		el.setAttribute('id', id);
		head.appendChild(el);
	}


	function check() {
		console.log('Looking for update');
		// Check if there is an update compared to the manifest in cache
		return loader.check().then(function () {
			if (loader.corruptNewManifest) {
				return loader.reset();
			}
			return loader.download();
		}).then(function () {
			var hasUpdate = loader.update(false);
			console.log('Update available:', hasUpdate);
			window.cordova.fireDocumentEvent('sourceUpdated');
			isLoaded = true;
		});
	}


	function setupLoader(serverRoot) {
		currentServer = serverRoot;
		window.appInfo.server = currentServer;
		loader = window.loader = new AppLoader('source', {
			localRoot: 'js/',
			serverRoot: currentServer,
			mode: 'mirror',
			cacheBuster: true
		});
		assetLoader = new AppLoader('ui', {
			localRoot: '',
			serverRoot: currentServer,
			mode: 'mirror',
			cacheBuster: true,
			manifest: 'assetMap.json'
		});

		// Progress of download should be managed by app code
		var ProgressView = window.plugins.ProgressView;

		var currentProgress = 0;
		function onProgress(status) {
			if (status.percentage > currentProgress) {
				ProgressView.setProgress(status.percentage);
				currentProgress = status.percentage;
			}
		}

		check()
			.then(function () {
				splashscreen.hide();
				return assetLoader.check().then(function (needUpdate) {
					if (!needUpdate) {
						return;
					}
					if (assetLoader.corruptNewManifest) {
						return assetLoader.reset();
					}
					console.log('1');
					ProgressView.show('Downloading User Interface');
					return assetLoader.download(onProgress);
				}).then(function () {
					assetLoader.update(false);
					ProgressView.hide();
					console.log('2');
				}).catch(ProgressView.hide);
			}).then(function () {
				// Load the files from the server's manifest
				console.log('3');
				for (var fileId in loader.manifest.files) {
					var file = loader.manifest.files[fileId];
					var uri = loader.cache.toInternalURL(file.filename);
					console.log('Loading file:', file.filename, uri);
					if (uri.indexOf('cdvfile://') !== 0) {
						throw(new Error('File not local' + uri));
					}
					loadFile(uri, fileId);
				}
			})
			.catch(resetServer);

		document.addEventListener('resume', function () {
			prefs.fetch('server').then(function (serverDev) {
				if (currentServer === (serverDev || defaultServer)) {
					check()
						.then(splashscreen.hide)
						.catch(resetServer);
				} else {
					loader.reset();
				}
			});
		});
	}

	function start() {
		splashscreen = window.navigator.splashscreen;
		prefs = window.plugins.appPreferences;
		splashscreen.show();
		cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
		window.StatusBar.hide();
		if (cordova.platformId === 'android') {
			var AndroidFullScreen = window.AndroidFullScreen;
			AndroidFullScreen.isImmersiveModeSupported(function (isSupported) {
				if (isSupported) {
					AndroidFullScreen.immersiveMode();
				}
			});
		}

		window.navigator.appInfo.getAppInfo(function (appInfo) {
			prefs.fetch('devMode').then(function (isDevMode) {
				window.devMode = isDevMode;
			});
			window.appInfo = appInfo;
			window.AppSettings.get(function (settings) {
				defaultServer = settings.server;
				prefs.fetch('server').then(function (serverDev) {
					setupLoader(serverDev || defaultServer);
				}).catch(function (e) {
					console.error(e);
					setupLoader(defaultServer);
				});
			}, function (e) {
				console.error(e);
				window.alert('Could not load local settings');
			}, ['server']);
		});
		document.addEventListener('pause', splashscreen.show);
	}

	document.addEventListener('deviceready', start, false);
})(window.cordova);