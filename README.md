# Photon-Drop-File-Format (.njp)

This repositiory outlines the file format used in the Photon Drop Threejs Client. 
The client uses a custom file format, which stores data as binary buffers to be
delivered to the client. The file format is designed to be lightweight, to reduce
the amount of data being sent to and from the server for distribution, and has the
option to include serval models in the a single file and define custom shaders.

### Reason for the Name?

The file extension .njp stands for "Ninja Pack". The reason is because we're recreating
a game from the Dreamcast era, and the Dreamcast used lots of Japanese names like, "Katana",
"Ninja" and "Shinobi" in the SDK files. In order to pay homage we use the term "Ninja Pack"
as a toung-in-cheek through back, but the file format is completely independent from these
files.

### Reason for the Format?

Using a custom format wasn't my first choice, or my second. Originally the idea was to simply
use .dae or .gltf. While support may have improved on either of these, when writing our client
support was nearly non-existent. I attempted to write exporters for these myself, but in terms
of .dae, XML is not an enjoyable file structure to work with, and was unable for find examples
for alot of the use cases we were working with. And .gltf had just been defined, and is a lot 
more complicated than it needs to be. So for our purposes, we ended up going with a simplified
version of .gltf, which is what .gltf needed to be to begin with.

### File Structure

The file is split into three parts:

1. The magic number  
2. The json header  
3. The buffer body  

The Magic number contains either the text of "NJP" or "NJPC". In most cases this should be "NJPC", which stands for "compressed", otherwise the default is non-compressed. The compression means that all of the data after the first either bits is compressed and needs to be decompressed before being able to parse the model. Again this is from the design decision of making the file format lightweight to stribute from a server. Following the first magic number is the length of the json header. 

The json header contains the offsets for the data outlined inside the buffer data. This is done by defining three key values, "materials", "textures" and "geometries". And example of this is outlined below.

```
{
	textures : [
		{
			wrapS :
			wrapT :
			transparent:
			image : { offset : 0, length : 0}
		},
		...
	],
	materials : [
		{
			type : "ShaderMaterial",
			vertexShader : "...",
			fragmentShader : "...",
			map : 0
		}
	],
	geometries : [
		{
			type : mesh,
			position : x, y, z,
			rotation : x, y, z,
			parent : (index),
			position : { offset : 0, length 0},
			normals : { offset : 0, length 0},
			atlascoords : { offset : 0, length 0},
			material : 0
		},{
			type : skinnedmesh,
			position : x, y, z,
			rotation : x, y, z,
			parent : (index),
			position : { offset : 0, length 0},
			normals : { offset : 0, length 0},
			atlascoords : { offset : 0, length 0},
			bones : {offset : 0, length 0},
			animations : [
				name : "run",
				{ offset : 0, length 0 }
			]
			material : [2, 3, 4],
			groups : [],
			ranges: []
		}
	]
}
```

The idea is that paramters that can be defined in json are defined in JSON, everything else is defined in binary following the JSON. The offset of 0 starts at the beginning of the buffer, not at the beginning of the file. And otherwise, everything is assumed to have a given format. So position is always x,y,z floats, so all you have to do is define the offset and length, and the file format assumes a specific structure. So there's no need for buffer view definitions.

Following the JSON header is the binary data itself. The JSON header will have the object definition of "offset" and "length" for data defined in the buffer. The data can then be read for that amount of data.

### Using the Exporter

```
let expt = new THREE.PackExporter();
expt.add(mesh_1);
expt.add(mesh_2);
expt.add(mesh_3);
let blob = expt.pack();
```

The exporter is likely a little different from other 

### Using the Importer


