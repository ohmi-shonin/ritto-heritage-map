"use strict";
// OverPass Server Control(With easy cache) - Updated for Ritto City geographic filtering
class OverPassControl {

	constructor() {
		this.Cache = { "geojson": [], "targets": [] };   // Cache variable
		this.LLc = {};
		this.CacheZoom = 14;
		this.UseServer = 0;
		this.CacheIdxs = {};		// 連想配列にtargets内のidxを保存
	}

	// Overpass APIからデータ取得
	// targets: Conf.osm内の目標 / progress: 処理中に呼び出すプログラム
	getGeojson(targets, progress) {
		return new Promise((resolve, reject) => {
			console.log("overPassCont: Check: Ritto City area filtering v2")
			if (overPassCont.LLc["ritto_city_area_v2"] !== void 0 || Conf.static.mode) {
				console.log("overPassCont: Cache Hit.")       // Within Cache range
				resolve(overPassCont.Cache)
			} else {
				let maparea = '34.95000,135.95000,35.10000,136.10000'  // south,west,north,east format for OverPass bbox
				let query = ""
				targets.forEach(key => {
					if (Conf.osm[key] !== undefined) Conf.osm[key].overpass.forEach(val => query += val + ";")
				})
				let url = Conf.system.OverPassServer[overPassCont.UseServer] + `?data=[out:json][timeout:30];(${query});out body meta;>;out skel;`
				console.log("overPassCont: GET: " + url)
				$.ajax({
					"type": 'GET', "dataType": 'json', "url": url, "cache": false, "xhr": () => {
						var xhr = new window.XMLHttpRequest();
						xhr.addEventListener("progress", (evt) => {
							console.log("overPassCont: Progress: " + evt.loaded);
							if (progress !== undefined) progress(evt.loaded);
						}, false);
						return xhr;
					}
				}).done(function (data) {
					console.log("overPassCont: done.")
					overPassCont.LLc["ritto_city_area_v2"] = true
					if (data.elements.length == 0) { resolve(); return };
					let osmxml = data;
					let geojson = osmtogeojson(osmxml, { flatProperties: true });
					overPassCont.setCache(geojson.features);
					overPassCont.Cache.geojson.forEach((key, idx) => {	// no target no geojson
						if (overPassCont.Cache.targets[idx] == undefined) {
							delete overPassCont.Cache.geojson[idx];
							delete overPassCont.Cache.targets[idx];
						};
					});
					console.log("overPassCont: Cache Update");
					resolve(overPassCont.Cache);
				}).fail(function (jqXHR, statusText, errorThrown) {
					console.log("overPassCont: " + statusText);
					overPassCont.UseServer = (overPassCont.UseServer + 1) % Conf.system.OverPassServer.length;
					reject(jqXHR, statusText, errorThrown);
				});
			};
		});
	}

	getOsmIds(osmids) {
		osmids = [...new Set(osmids)];
		return new Promise((resolve, reject) => {
			let params = "(", pois = { node: "", way: "", relation: "" };
			osmids.forEach(id => {
				let query = id.split("/");
				pois[query[0]] += query[1] + ",";
			});
			Object.keys(pois).forEach(category => {
				if (pois[category] !== "") params += `${category}(id:${pois[category].slice(0, -1)});`;
			});
			let url = Conf.system.OverPassServer[overPassCont.UseServer] + '?data=[out:json][timeout:20];' + params + ');out body meta;>;out skel;';
			console.log("overPassCont: GET: " + url);
			$.ajax({ "type": 'GET', "dataType": 'json', "url": url, "cache": false, timeout: 20000 }).done(function (osmxml) {
				console.log("overPassCont: getOsmIds: done.");
				if (osmxml.elements.length == 0) { resolve(); return };
				let geojson = osmtogeojson(osmxml, { flatProperties: true });
				overPassCont.setCache(geojson.features);
				console.log("overPassCont: Cache Update");
				resolve(overPassCont.Cache);
			}).fail(function (jqXHR, statusText, errorThrown) {
				console.log("overPassCont: " + statusText);
				overPassCont.UseServer = (overPassCont.UseServer + 1) % Conf.system.OverPassServer.length;
				reject(jqXHR, statusText, errorThrown);
			});
		})
	}

	// 指定したpropertiesがtagsに含まれるか判定
	isTagsInclude(properties, tags) {
		for (let key in properties) {
			const tagWithEqual = `${key}=${properties[key]}`	// `key=value`の形式をチェック
			const tagWithNoEqual = `${key}!=${properties[key]}`	// `key!=value`の形式をチェック
			if (tags.includes(tagWithEqual)) return true
			if (tags.includes(tagWithNoEqual)) return false
			if (tags.includes(key)) return true					// `key`のみの形式をチェック
		}
		return false;
	}

	// tagsを元にキャッシュセット
	setCache(geojson) {
		let osmkeys = Object.keys(Conf.osm).filter(key => Conf.osm[key].file == undefined);
		osmkeys.forEach(target => {
			geojson.forEach((val) => {
				let isTarget = overPassCont.isTagsInclude(val.properties, Conf.osm[target].tags)
				let cidx = overPassCont.CacheIdxs[val.properties.id];
				if (cidx == undefined && isTarget) { // キャッシュが無い&ターゲット時は更新
					overPassCont.Cache.geojson.push(val);
					overPassCont.Cache.targets.push([target]);
					cidx = overPassCont.Cache.geojson.length - 1;
					overPassCont.CacheIdxs[val.properties.id] = cidx;
				} else if (isTarget) {
					let ot = overPassCont.Cache.targets[cidx]
					overPassCont.Cache.targets[cidx] = ot.concat(target);
				}
			});
		})
	}

	getTarget(ovanswer, target) {
		let geojson = ovanswer.geojson.filter(function (val, gidx) {
			let found = false
			for (let tidx in ovanswer.targets[gidx]) {
				if (ovanswer.targets[gidx][tidx] == target) { found = true; break }
			};
			return found
		});
		return geojson
	}

	setOsmJson(osmjson) {		// set Static osmjson
		let geojson = osmtogeojson(osmjson, { flatProperties: true });
		overPassCont.setCache(geojson.features);
		return overPassCont.Cache;
	}

}
