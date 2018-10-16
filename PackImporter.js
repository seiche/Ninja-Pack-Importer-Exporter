/**
 * Pack Import
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
 *
 */

THREE.PackImporter = function () {

	this.input = null;
	this.buffer = null;
	this.view = null;

	this.textures = [];
	this.materials = [];
	this.meshes = [];

}

THREE.PackImporter.prototype = {

	constructor: THREE.PackImporter,

	load: function (url) {

		return new Promise((resolve, reject) => {

			let ajax = new XMLHttpRequest();
			ajax.open("GET", url);
			ajax.responseType = "arraybuffer";
			ajax.send();

			ajax.onload = () => {
				let list = this.unpack(ajax.response);
				resolve(list);
			}

		});

	},

	loadAsync : function(url, callback) {

		let ajax = new XMLHttpRequest();
		ajax.open("GET", url);
		ajax.responseType = "arraybuffer";
		ajax.send();

		ajax.onload = () => {
			let list = this.unpack(ajax.response);
			callback(list);
		}

	},

	unpack: function (arraybuffer) {

		let view = new DataView(arraybuffer);
		let magic = "";

		for (let i = 0; i < 4; i++) {
			let code = view.getUint8(i);
			if (!code) {
				continue;
			}
			magic += String.fromCharCode(code)
		}

		let str_len = view.getUint32(4, true);
		let jsonBuffer, dataBuffer;

		if (magic === "NJP") {

			// Not compressed

			jsonBuffer = arraybuffer.slice(8, str_len + 8);
			dataBuffer = arraybuffer.slice(str_len + 8);

		} else {

			// Decompress

			let compBuffer = arraybuffer.slice(8);
			let array = new Uint8Array(compBuffer);
			let result = pako.inflate(array);

			jsonBuffer = result.buffer.slice(0, str_len);
			dataBuffer = result.buffer.slice(str_len);

		}

		view = new DataView(jsonBuffer);
		let json_str = "";
		for (let i = 0; i < str_len; i++) {
			json_str += String.fromCharCode(view.getUint8(i));
		}
		this.input = JSON.parse(json_str);

		this.buffer = dataBuffer;
		this.view = new DataView(this.buffer);

		// Finished reading the header

		this.input.textures.forEach(tex => {
			this.readTexture(tex);
		});

		this.input.materials.forEach(mat => {
			this.readMaterial(mat);
		});

		this.input.geometry.forEach(geo => {
			this.readGeometry(geo);
		});

		return this.meshes;

	},

	readTexture: function (tex) {

		let dataUrl = "";
		for (let i = 0; i < tex.image.length; i++) {
			dataUrl += String.fromCharCode(this.view.getUint8(i + tex.image.offset));
		}

		let image = new Image();
		image.src = dataUrl;
		delete tex.image;

		let texture = new THREE.Texture(image);
		for (let key in tex) {
			texture[key] = tex[key];
		}

		this.textures.push(texture);
		image.onload = () => {
			texture.needsUpdate = true;
		}

	},

	readMaterial: function (mat) {

		let type = mat.type;
		delete mat.type;
		delete mat.index;

		let keys = Object.keys(mat);

		if (keys.indexOf("map") !== -1) {
			mat.map = this.textures[mat.map];
		}

		if (keys.indexOf("uniforms") !== -1) {
			for (let attr in mat.uniforms) {
				if (mat.uniforms[attr].type !== 't') {
					continue;
				}
				mat.uniforms[attr].value = this.textures[mat.uniforms[attr].value];
			}
		}

		if (keys.indexOf("vertexShader") !== -1) {
			let vs = "";
			for (let i = 0; i < mat.vertexShader.length; i++) {
				vs += String.fromCharCode(this.view.getUint8(i + mat.vertexShader.offset));
			}
			mat.vertexShader = vs;
		}

		if (keys.indexOf("fragmentShader") !== -1) {
			let fs = "";
			for (let i = 0; i < mat.fragmentShader.length; i++) {
				fs += String.fromCharCode(this.view.getUint8(i + mat.fragmentShader.offset));
			}
			mat.fragmentShader = fs;
		}

		let material = new THREE[type](mat);
		this.materials.push(material);

	},

	readGeometry: function (geo) {

		let geometry = new THREE.BufferGeometry();

		// First Add Attributes

		for (let key in geo.attributes) {
			let attr = geo.attributes[key];
			let offset = attr.array.offset;
			let length = attr.array.length;
			let bytes = this.buffer.slice(offset, offset + length);
			let array = new Float32Array(bytes);
			let attribute = new THREE.BufferAttribute(array, attr.itemSize);
			geometry.addAttribute(key, attribute);
		}

		if (geo.userData) {
			geometry.userData = geo.userData;
		}

		if(!geo.groups) {
			console.log(geo);
		}

		geo.groups.forEach(group => {
			geometry.addGroup(group.start, group.count, group.materialIndex);
		});

		// Get Material

		let material = geo.material;
		if (!Array.isArray(material)) {
			material = this.materials[material];
		} else {
			for (let i = 0; i < material.length; i++) {
				material[i] = this.materials[material[i]];
			}
		}
		
		geometry.computeBoundingBox();
		let mesh = new THREE[geo.type](geometry, material);

		mesh.name = geo.name;

		mesh.position.x = geo.position[0];
		mesh.position.y = geo.position[1];
		mesh.position.z = geo.position[2];

		mesh.rotation.x = geo.rotation[0];
		mesh.rotation.y = geo.rotation[1];
		mesh.rotation.z = geo.rotation[2];

		mesh.scale.x = geo.scale[0];
		mesh.scale.y = geo.scale[1];
		mesh.scale.z = geo.scale[2];

		if (geo.type !== "SkinnedMesh") {
			this.meshes.push(mesh);
			return;
		}

		let bones = new Array(geo.bones.count);

		let ofs = geo.bones.array.offset;
		for (let i = 0; i < geo.bones.count; i++) {
			let id = this.view.getInt16(ofs + 0, true);
			let parent_id = this.view.getInt16(ofs + 2, true);
			ofs += 4;

			let bone = new THREE.Bone();
			let matrix = new THREE.Matrix4();
			for (let k = 0; k < 16; k++) {
				matrix.elements[k] = this.view.getFloat32(ofs, true);
				ofs += 4;
			}

			bone.name = geo.bones.names[i];
			bone.applyMatrix(matrix);
			bone.updateMatrix();
			bone.updateMatrixWorld();

			if (bones[parent_id]) {
				bones[parent_id].add(bone);
				bone.updateMatrix();
				bone.updateMatrixWorld();
			}

			bones[id] = bone;
		}

		var armSkeleton = new THREE.Skeleton(bones);
		mesh.add(armSkeleton.bones[0]);
		mesh.bind(armSkeleton);
		
		mesh.geometry.animations = [];

		if(!geo.animation) {
			geo.animation = [];
		}

		geo.animation.forEach(anim => {
			
			let type = anim.type;
			delete anim.type;
			let offset = anim.hierarchy.offset;
			anim.hierarchy = this.readKeyFrameAnimation(offset, bones);
			var clip = THREE.AnimationClip.parseAnimation(anim, bones);
			clip.optimize();
			mesh.geometry.animations.push(clip);

		});

		return this.meshes.push(mesh);

	},

	readKeyFrameAnimation: function (ofs, bones) {

		let hierarchy = new Array(bones.length);

		for (let k = 0; k < bones.length; k++) {
			let parent = this.view.getInt32(ofs, true);
			let num_keys = this.view.getUint32(ofs + 4, true);
			ofs += 8;

			hierarchy[k] = {
				parent: parent,
				keys: new Array(num_keys)
			}

			for (let j = 0; j < num_keys; j++) {

				let time = this.view.getFloat32(ofs, true);
				ofs += 4;

				let prs = [
					String.fromCharCode(this.view.getUint8(ofs + 0)),
					String.fromCharCode(this.view.getUint8(ofs + 1)),
					String.fromCharCode(this.view.getUint8(ofs + 2))
				];
				ofs += 4;

				let frame = {
					time: time
				}

				if (prs.indexOf('p') !== -1) {
					frame.pos = new Array(3);
					frame.pos[0] = this.view.getFloat32(ofs + 0, true);
					frame.pos[1] = this.view.getFloat32(ofs + 4, true);
					frame.pos[2] = this.view.getFloat32(ofs + 8, true);
					ofs += 12;
				}

				if (prs.indexOf('r') !== -1) {
					frame.rot = new Array(4);
					frame.rot[0] = this.view.getFloat32(ofs + 0, true);
					frame.rot[1] = this.view.getFloat32(ofs + 4, true);
					frame.rot[2] = this.view.getFloat32(ofs + 8, true);
					frame.rot[3] = this.view.getFloat32(ofs + 12, true);
					ofs += 16;
				}

				if (prs.indexOf('s') !== -1) {
					frame.scl = new Array(3);
					frame.scl[0] = this.view.getFloat32(ofs + 0, true);
					frame.scl[1] = this.view.getFloat32(ofs + 4, true);
					frame.scl[2] = this.view.getFloat32(ofs + 8, true);
					ofs += 12;
				}

				hierarchy[k].keys[j] = frame;

			}

		};

		return hierarchy;

	}

}
