/**
 * Pack Exporter
 *
 * Copyright (c) 2018 Benjamin Collins
 * MIT License
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify, merge,
 * publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
 * to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
 * PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
 * FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

THREE.PackExporter = function () {

	this.output = {
		textures: [],
		materials: [],
		geometry: []
	}

	this.compress = true;
	this.textures = {}
	this.materials = {};

	this.offset = 0;
	this.buffers = [];
}

THREE.PackExporter.prototype = {

	constructor: THREE.PackExporter,

	export: function (name) {

		let json_str = JSON.stringify(this.output);
		
		let buffer = new ArrayBuffer(8);
		let view = new DataView(buffer);

		let magic = "NJP\0";
		if(this.compress) {
			magic = "NJPC";
		}

		for(let i = 0; i < 4; i++) {
			view.setUint8(i, magic.charCodeAt(i));
		}
		view.setUint32(4, json_str.length, true);

		// If not compressed, create blob and add to zip

		if(!this.compress) {
			this.buffers.unshift(buffer, json_str);
			let blob = new Blob(this.buffers);
			ZIP.add_blob(name + ".njp", blob);
			return;
		}

		// Otherwise add buffer, and compress
		
		this.buffers.unshift(json_str);
		let blob = new Blob(this.buffers);

		let reader = new FileReader();

		reader.onload = (e) => {
			
			let array = new Uint8Array(e.target.result);
			let result = pako.deflate(array);
			let compBlob = new Blob([buffer, result.buffer])
			ZIP.add_blob(name + ".njp", compBlob);

		}

		reader.readAsArrayBuffer(blob);

	},

	add: function (mesh) {

		this.addTextures(mesh);
		this.addMaterials(mesh);
		this.addGeometry(mesh);

	},

	addTextures: function (mesh) {

		let materials = mesh.material;

		if (!materials) {
			return;
		}

		if (!Array.isArray(materials)) {
			materials = [materials];
		}

		for (let i = 0; i < materials.length; i++) {

			if (!materials[i].map && !materials[i].uniforms) {
				continue;
			}

			let keys = Object.keys(this.textures);

			// Find the map

			if (materials[i].map && keys.indexOf(materials[i].map.uuid) === -1){
				
				let uuid = materials[i].map.uuid;
				this.textures[uuid] = this.output.textures.length;
				let dataUrl = materials[i].map.image.toDataURL();

				this.output.textures.push({
					wrapS: materials[i].map.wrapS,
					wrapT: materials[i].map.wrapT,
					flipY: materials[i].map.flipY,
					image: {
						offset: this.offset,
						length: dataUrl.length
					},
					name: materials[i].map.name
				});


				let encoder = new TextEncoder();
				let buffer = encoder.encode(dataUrl).buffer
				this.buffers.push(buffer);
				this.offset += buffer.byteLength;

			}

			// Find any Texture Uniforms

			if (materials[i].uniforms) {

				for (let attr in materials[i].uniforms) {

					if (materials[i].uniforms[attr].type !== 't') {
						continue;
					}

					let uuid = materials[i].uniforms[attr].value.uuid;
					if (keys.indexOf(uuid) !== -1) {
						continue;
					}

					this.textures[uuid] = this.output.textures.length;
					let dataUrl = materials[i].uniforms[attr].value.image.toDataURL();

					this.output.textures.push({
						wrapS: materials[i].uniforms[attr].value.wrapS,
						wrapT: materials[i].uniforms[attr].value.wrapT,
						flipY: materials[i].uniforms[attr].value.flipY,
						image: {
							offset: this.offset,
							length: dataUrl.length
						},
						name: materials[i].uniforms[attr].value.name
					});

					let encoder = new TextEncoder();
					let buffer = encoder.encode(dataUrl).buffer
					this.buffers.push(buffer);
					this.offset += buffer.byteLength;
				}

			}

		}

	},

	addMaterials: function (mesh) {
		
		let materials = mesh.material;

		if (!mesh.material) {
			return;
		}

		if (!Array.isArray(mesh.material)) {
			materials = [mesh.material];
		}

		let encoder, buffer;

		for (let i = 0; i < materials.length; i++) {

			let uuids = Object.keys(this.materials);
			if(uuids.indexOf(materials[i].uuid) !== -1) {
				continue;
			}
			
			let compare = new THREE[materials[i].type];
			let json = {};
			for (let key in materials[i]) {

				if (typeof materials[i][key] === "function") {
					continue;
				}


				switch (key) {
				case "type":

					json.type = materials[i].type;

					break;
				case "map":

					if(materials[i].map) {
						json.map = this.textures[materials[i].map.uuid];
					}

					break;
				case "uniforms":

					json.uniforms = {};
					for (let key in materials[i].uniforms) {
						json.uniforms[key] = {};

						for (let attr in materials[i].uniforms[key]) {
							json.uniforms[key][attr] = materials[i].uniforms[key][attr];
						}

						if (materials[i].uniforms[key].type === 't') {
							json.uniforms[key].value = this.textures[materials[i].uniforms[key].value.uuid];
						}

					}

					break;
				case "vertexShader":
					let vs = materials[i].vertexShader;
					json.vertexShader = {
						offset: this.offset,
						length: vs.length
					}

					encoder = new TextEncoder();
					buffer = encoder.encode(vs).buffer
					this.buffers.push(buffer);
					this.offset += buffer.byteLength;
					break;
				case "fragmentShader":
					let fs = materials[i].fragmentShader;
					json.fragmentShader = {
						offset: this.offset,
						length: fs.length
					}

					encoder = new TextEncoder();
					buffer = encoder.encode(fs).buffer
					this.buffers.push(buffer);
					this.offset += buffer.byteLength;
					break;
				case "userData":
				case "uuid":
				case "defaultAttributeValues":
				case "defines":
				case "extensions":

					break;
				default:

					if (materials[i][key] !== compare[key]) {
						json[key] = materials[i][key];
					}
					break;
				}

			}

			let uuid = materials[i].uuid;
			this.materials[uuid] = this.output.materials.length;
			this.output.materials.push(json);

		}

	},

	addGeometry: function (mesh) {

		let json = {};
		json.type = mesh.type;
		json.name = mesh.name;

		if (!Array.isArray(mesh.material)) {
			let uuid = mesh.material.uuid;
			json.material = this.materials[uuid];
		} else {
			json.material = new Array(mesh.material.length);
			for (let i = 0; i < mesh.material.length; i++) {
				let uuid = mesh.material[i].uuid;
				json.material[i] = this.materials[uuid];
			}
		}

		let geometry;

		if (mesh.geometry.type === "BufferGeometry") {
			geometry = mesh.geometry;
		} else {
			geometry = new THREE.BufferGeometry();
			geometry.fromGeometry(mesh.geometry);
		}

		json.attributes = {};

		for (let attr in geometry.attributes) {

			let buffer = geometry.attributes[attr].array.buffer;

			json.attributes[attr] = {
				itemSize: geometry.attributes[attr].itemSize,
				count: geometry.attributes[attr].count,
				array: {
					offset: this.offset,
					length: buffer.byteLength
				}
			};

			this.buffers.push(buffer);
			this.offset += buffer.byteLength;

		}

		// Add userdata

		if (mesh.name.length) {
			json.name = mesh.name;
		}

		json.position = [mesh.position.x, mesh.position.y, mesh.position.z];
		json.rotation = [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z];
		json.scale = [mesh.scale.x, mesh.scale.y, mesh.scale.z];
		json.groups = mesh.geometry.groups;
		
		if (mesh.geometry.userData) {
			json.userData = mesh.geometry.userData;
		}

		// If not skinned mesh, end here

		if (mesh.type !== "SkinnedMesh") {
			this.output.geometry.push(json);
			return;
		}

		// Add bones to geometry

		let boneBuffer = this.packBones(mesh.skeleton);
		json.bones = {
			names: new Array(mesh.skeleton.bones.length),
			count: mesh.skeleton.bones.length,
			array: {
				offset: this.offset,
				length: boneBuffer.byteLength
			}
		}

		for (let i = 0; i < mesh.skeleton.bones.length; i++) {
			json.bones.names[i] = mesh.skeleton.bones[i].name;
		}

		this.buffers.push(boneBuffer);
		this.offset += boneBuffer.byteLength;

		// If no animations, return

		if (!mesh.geometry.animations || !mesh.geometry.animations.length) {
			this.output.geometry.push(json);
			return;
		}

		// Read and pack animations

		json.animation = [];
		for (let i = 0; i < mesh.geometry.animations.length; i++) {

			let keyFrames = this.readAnimation(mesh.geometry.animations[i], mesh.skeleton.bones);
			let animBuffer = this.packAnimation(keyFrames);

			json.animation.push({
				name: mesh.geometry.animations[i].name,
				length: mesh.geometry.animations[i].duration,
				type: "keyframes",
				hierarchy: {
					offset: this.offset,
					length: animBuffer.byteLength
				}
			});

			this.buffers.push(animBuffer);
			this.offset += animBuffer.byteLength;

		}

		this.output.geometry.push(json);

	},

	packBones: function (skeleton) {

		let length = skeleton.bones.length;
		let arrayLength = length * 68;
		let buffer = new ArrayBuffer(arrayLength);
		let view = new DataView(buffer);

		let ofs = 0;

		for (let i = 0; i < skeleton.bones.length; i++) {
			let id = i;
			let parent = skeleton.bones.indexOf(skeleton.bones[i].parent);
			let elements = skeleton.bones[i].matrix.elements;

			view.setInt16(ofs, id, true);
			view.setInt16(ofs + 2, parent, true);
			ofs += 4;

			elements.forEach(e => {
				view.setFloat32(ofs, e, true);
				ofs += 4;
			});

		}

		return buffer;

	},

	readAnimation: function (animation, bones) {

		let blockSize = 0;

		let parent = -1;
		let tracks = animation.tracks;

		let keyFrames = {
			hierarchy: []
		}

		for (let k = 0; k < bones.length; k++) {

			blockSize += 8;

			let pos = tracks[k * 3 + 0];
			let rot = tracks[k * 3 + 1];
			let scl = tracks[k * 3 + 2];

			let time = {};

			for (let j = 0; j < pos.times.length; j++) {
				let key = pos.times[j].toString();
				time[key] = time[key] || {};
				time[key].pos = [
					pos.values[j * 3 + 0],
					pos.values[j * 3 + 1],
					pos.values[j * 3 + 2]
				];
			}

			for (let j = 0; j < rot.times.length; j++) {
				let key = rot.times[j].toString();
				time[key] = time[key] || {};
				time[key].rot = [
					rot.values[j * 4 + 0],
					rot.values[j * 4 + 1],
					rot.values[j * 4 + 2],
					rot.values[j * 4 + 3]
				];
			}

			for (let j = 0; j < scl.times.length; j++) {
				let key = scl.times[j].toString();
				time[key] = time[key] || {};
				time[key].scl = [
					scl.values[j * 3 + 0],
					scl.values[j * 3 + 1],
					scl.values[j * 3 + 2]
				];
			}

			let keys = Object.keys(time);
			keys.sort(function (a, b) {
				return parseFloat(a) - parseFloat(b);
			});

			var hierarchy = new Array(keys.length);
			blockSize += keys.length * 8;

			for (let j = 0; j < keys.length; j++) {

				let frame = time[keys[j]];
				frame.time = keys[j];

				let mat4 = new THREE.Matrix4();

				if (frame.rot) {
					let r = frame.rot;
					let q = new THREE.Quaternion(r[0], r[1], r[2], r[3]);
					mat4.makeRotationFromQuaternion(q);
					blockSize += 16;
				}

				if (frame.scl) {
					let s = frame.scl;
					let v = new THREE.Vector3(s[0], s[1], s[2]);
					mat4.scale(v);
					blockSize += 12;
				}

				if (frame.pos) {
					let p = frame.pos;
					let v = new THREE.Vector3(p[0], p[1], p[2]);
					mat4.setPosition(v);
					blockSize += 12;
				}
				frame.elements = mat4.elements;
				hierarchy[j] = frame;
			}

			keyFrames.hierarchy.push({
				parent: parent,
				keys: hierarchy
			});

			parent++;
		}

		keyFrames.blockSize = blockSize;
		return keyFrames;

	},

	packAnimation: function (anim) {

		let size = anim.blockSize;

		let byteLen = size;
		let buffer = new ArrayBuffer(byteLen);
		let view = new DataView(buffer);

		let ofs = 0;

		let num_frame = 0;
		let hierarchy = anim.hierarchy;
		for (let k = 0; k < hierarchy.length; k++) {

			view.setInt32(ofs, hierarchy[k].parent, true);
			view.setUint32(ofs + 4, hierarchy[k].keys.length, true);
			ofs += 8;

			for (let j = 0; j < hierarchy[k].keys.length; j++) {

				num_frame++;
				let frame = hierarchy[k].keys[j];
				let time = frame.time;
				let elements = frame.elements;

				view.setFloat32(ofs, time, true);
				ofs += 4;

				let str = "";

				if (frame.pos) {
					str += 'p';
				}

				if (frame.rot) {
					str += 'r';
				}

				if (frame.scl) {
					str += 's';
				}

				for (let n = 0; n < str.length; n++) {
					view.setUint8(ofs + n, str.charCodeAt(n));
				}
				ofs += 4;
				if (frame.pos) {
					view.setFloat32(ofs + 0, frame.pos[0], true);
					view.setFloat32(ofs + 4, frame.pos[1], true);
					view.setFloat32(ofs + 8, frame.pos[2], true);
					ofs += 12;
				}

				if (frame.rot) {
					view.setFloat32(ofs + 0, frame.rot[0], true);
					view.setFloat32(ofs + 4, frame.rot[1], true);
					view.setFloat32(ofs + 8, frame.rot[2], true);
					view.setFloat32(ofs + 12, frame.rot[3], true);
					ofs += 16;
				}

				if (frame.scl) {
					view.setFloat32(ofs + 0, frame.scl[0], true);
					view.setFloat32(ofs + 4, frame.scl[1], true);
					view.setFloat32(ofs + 8, frame.scl[2], true);
					ofs += 12;
				}

			}

		}

		return buffer;

	}


}
