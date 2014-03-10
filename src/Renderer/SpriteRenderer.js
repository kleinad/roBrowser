/**
 * Renderer/SpriteRenderer.js
 *
 * Rendering sprite in 2D or 3D context
 *
 * This file is part of ROBrowser, Ragnarok Online in the Web Browser (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */
define(["Utils/WebGL", "Utils/gl-matrix", "./Camera"],
function(      WebGL,         glMatrix,      Camera )
{
	"use strict";


	/**
	 * Import
	 */
	var mat4 = glMatrix.mat4;


	/**
	 * Generic Vertex Shader
	 * @var {string}
	 */
	var _vertexShader = [
		"attribute vec2 aPosition;",
		"attribute vec2 aTextureCoord;",
		"attribute float aIsUp;",

		"varying vec2 vTextureCoord;",

		"uniform mat4 uModelViewMat;",
		"uniform mat4 uViewModelMat;",
		"uniform mat4 uProjectionMat;",

		"uniform float uCameraLatitude;",

		"uniform vec2 uSpriteRendererSize;",
		"uniform vec2 uSpriteRendererOffset;",
		"uniform mat4 uSpriteRendererAngle;",
		"uniform vec3 uSpriteRendererPosition;",

		"mat4 Project( mat4 mat, vec3 pos) {",

			// xyz = x(-z)y + middle of cell (0.5)
			"float x =  pos.x + 0.5;",
			"float y = -pos.z;",
			"float z =  pos.y + 0.5;",

			// Matrix translation
			"mat[3].x += mat[0].x * x + mat[1].x * y + mat[2].x * z;",
			"mat[3].y += mat[0].y * x + mat[1].y * y + mat[2].y * z;",
			"mat[3].z += mat[0].z * x + mat[1].z * y + mat[2].z * z;",
			"mat[3].w += mat[0].w * x + mat[1].w * y + mat[2].w * z;",

			// Spherical billboard
			"mat[0].xyz = vec3( 1.0, 0.0, 0.0 );",
			"mat[1].xyz = vec3( 0.0, 1.0, 0.0 );",
			"mat[2].xyz = vec3( 0.0, 0.0, 1.0 );",

			"return mat;",
		"}",

		"void main(void) {",
			"vTextureCoord = aTextureCoord;",

			// Calculate position base on angle and sprite offset/size
			"vec4 position = uSpriteRendererAngle * vec4( aPosition.x * uSpriteRendererSize.x, aPosition.y * uSpriteRendererSize.y, 0.0, 1.0 );",
			"position.x   += uSpriteRendererOffset.x;",
			"position.y   -= uSpriteRendererOffset.y + 0.5;",

			// Project to camera plane
			"gl_Position   = uProjectionMat * Project(uModelViewMat, uSpriteRendererPosition) * position;",

			// Hack for billboarding
			"vec3 camPosition = vec3( uViewModelMat[0].w, uViewModelMat[1].w, uViewModelMat[2].w);",
			"gl_Position.z   -= aIsUp * (uCameraLatitude * 0.25 / distance( gl_Position.xyz, camPosition.xyz));",
		"}"
	].join("\n");


	/**
	 * Generic Fragment Shader
	 * @var {string}
	 */
	var _fragmentShader = [
		"varying vec2 vTextureCoord;",

		"uniform sampler2D uDiffuse;",
		"uniform sampler2D uPalette;",

		"uniform bool uUsePal;",
		"uniform vec4 uSpriteRendererColor;",

		"uniform bool  uFogUse;",
		"uniform float uFogNear;",
		"uniform float uFogFar;",
		"uniform vec3  uFogColor;",

		"uniform float uShadow;",
		"uniform vec2 uTextSize;",

		// With palette we don't have a good result because of the gl.NEAREST, so smooth it.
		"vec4 bilinearSample(vec2 uv, sampler2D indexT, sampler2D LUT) {",
			"vec2 TextInterval = 1.0 / uTextSize;",

			"float tlLUT = texture2D(indexT, uv ).x;",
			"float trLUT = texture2D(indexT, uv + vec2(TextInterval.x, 0.0)).x;",
			"float blLUT = texture2D(indexT, uv + vec2(0.0, TextInterval.y)).x;",
			"float brLUT = texture2D(indexT, uv + TextInterval).x;",

			"float atlLUT = 1.0;",
			"float atrLUT = 1.0;",
			"float ablLUT = 1.0;",
			"float abrLUT = 1.0;",

			"if (tlLUT == 0.0) atlLUT = 0.0;",
			"if (trLUT == 0.0) atrLUT = 0.0;",
			"if (blLUT == 0.0) ablLUT = 0.0;",
			"if (brLUT == 0.0) abrLUT = 0.0;",

			"vec4 tl = vec4( texture2D(LUT, vec2(tlLUT,1.0)).rgb, atlLUT);",
			"vec4 tr = vec4( texture2D(LUT, vec2(trLUT,1.0)).rgb, atrLUT);",
			"vec4 bl = vec4( texture2D(LUT, vec2(blLUT,1.0)).rgb, ablLUT);",
			"vec4 br = vec4( texture2D(LUT, vec2(brLUT,1.0)).rgb, abrLUT);",

			"vec2 f  = fract( uv.xy * uTextSize );",
			"vec4 tA = mix( tl, tr, f.x );",
			"vec4 tB = mix( bl, br, f.x );",

			"return mix( tA, tB, f.y );",
		"}",


		"void main(void) {",

			// Don't render if it's not shown.
			"if (uSpriteRendererColor.a == 0.0) {",
				"discard;",
			"}",

			// Calculate texture
			"vec4 texture;",
			"if (uUsePal) {",
				"texture = bilinearSample( vTextureCoord, uDiffuse, uPalette );",
			"}",
			"else {",
				"texture = texture2D( uDiffuse, vTextureCoord.st );",
			"}",

			// No alpha, skip.
			"if ( texture.a == 0.0 )",
				"discard;",

			// Apply shadow, apply color
			"texture.rgb   *= uShadow;",
			"gl_FragColor   = texture * uSpriteRendererColor;",

			// Fog feature
			"if (uFogUse) {",
				"float depth     = gl_FragCoord.z / gl_FragCoord.w;",
				"float fogFactor = smoothstep( uFogNear, uFogFar, depth );",
				"gl_FragColor    = mix( gl_FragColor, vec4( uFogColor, gl_FragColor.w ), fogFactor );",
			"}",
		"}"
	].join("\n");



	/**
	 * Sprite Renderer NameSpace
	 */
	var SpriteRenderer = {};


	/**
	 * @var {function} functions to use to render
	 */
	SpriteRenderer.render = null;


	/**
	 * @var {number} sprite shadow (mult * color)
	 */
	SpriteRenderer.shadow = 1.0;


	/**
	 * @var {number} sprite angle rotation
	 */
	SpriteRenderer.angle = 0;

	/**
	 * @var {Float32Array[3]} sprite position in 3D world
	 */
	SpriteRenderer.position = new Float32Array(3);


	/**
	 * @var {Float32Array[4]} sprite color (color * color)
	 */
	SpriteRenderer.color = new Float32Array(4);


	/**
	 * @var {Float32Array[2]} sprite size
	 */
	SpriteRenderer.size = new Float32Array(2);


	/**
	 * @var {Float32Array[2]} sprite offset position
	 */
	SpriteRenderer.offset = new Float32Array(2);


	/**
	 * @var {object} sprite image information
	 */
	SpriteRenderer.image = {
		texture: null,
		palette: null,
		size:    new Float32Array(2)
	};


	/**
	 * @var {object} sprite imageData (for 2D context)
	 */
	SpriteRenderer.sprite = null;


	/**
	 * @var {object} sprite palette (for 2D context)
	 */
	SpriteRenderer.palette = null;


	/**
	 * @var {number} groupid used (avoid draw call)
	 */
	SpriteRenderer.groupId = 0;


	/**
	 * @var {WebGLProgram}
	 */
	var _program = null;


	/**
	 * @var {WebGLBuffer}
	 */
	var _buffer = null;


	/**
	 * @var {CanvasRenderingContext2D} canvas context
	 */
	var _ctx = null;


	/**
	 * @var {WebGLRenderingContext} 3d context
	 */
	var _gl = null;


	/**
	 * @var {number} group id
	 * Used to know if we have to bind texture again
	 */
	var _groupId = 0;


	/**
	 * @var {number} last group id
	 */
	var _lastGroupId = 0;


	/**
	 * @var {number} last shadow used
	 */
	var _shadow = null;


	/**
	 * @var {number} last rotation angle used
	 */
	var _angle = null;


	/**
	 * @var {object} last texture used
	 */
	var _texture = null;


	/**
	 * @var {boolean} do we use palette ?
	 */
	var _usepal = null;


	/**
	 * @var {Uint16Array} position in 2D canvas 
	 */
	var _pos = new Uint16Array(2);


	/**
	 * @var {mat4} last generated matrix (used for rotation)
	 */
	var _matrix = new Float32Array(4*4);


	/**
	 * Initialize SpriteRenderer Renderer
	 *
	 * @param {object} gl context
	 */
	SpriteRenderer.init = function init( gl )
	{
		if (!_buffer) {
			_buffer = gl.createBuffer();
			gl.bindBuffer( gl.ARRAY_BUFFER, _buffer );
			gl.bufferData( gl.ARRAY_BUFFER, new Float32Array([
				-0.5, +0.5, 0.0, 0.0, 1.0,
				+0.5, +0.5, 1.0, 0.0, 1.0,
				-0.5, -0.5, 0.0, 1.0, 0.0,
				+0.5, -0.5, 1.0, 1.0, 0.0
			]), gl.STATIC_DRAW );
		}

		if (!_program) {
			_program = WebGL.createShaderProgram( gl, _vertexShader, _fragmentShader );
		}
	};


	/**
	 * Initialize 3D Context
	 *
	 * @param {object} gl context
	 * @param {mat4} modelView
	 * @param {mat4} projection
	 * @param {object} fog structure
	 */
	SpriteRenderer.bind3DContext = function Bind3dContext( gl, modelView, projection, fog )
	{
		var attribute = _program.attribute;
		var uniform   = _program.uniform;

		gl.useProgram( _program );
		gl.uniformMatrix4fv( uniform.uProjectionMat, false,  projection );
		gl.uniformMatrix4fv( uniform.uModelViewMat,  false,  modelView );
		gl.uniformMatrix4fv( uniform.uViewModelMat,  false,  mat4.invert(_matrix, modelView) );

		// Fog settings
		gl.uniform1i(  uniform.uFogUse,   fog.use && fog.exist );
		gl.uniform1f(  uniform.uFogNear,  fog.near );
		gl.uniform1f(  uniform.uFogFar,   fog.far );
		gl.uniform3fv( uniform.uFogColor, fog.color );

		// Textures
		gl.uniform1i( uniform.uDiffuse, 0 );
		gl.uniform1i( uniform.uPalette, 1 );

		// Camera position for billboarding
		gl.uniform1f( uniform.uCameraLatitude, Camera.getLatitude() );

		// Enable all attributes
		gl.enableVertexAttribArray( attribute.aPosition );
		gl.enableVertexAttribArray( attribute.aTextureCoord );
		gl.enableVertexAttribArray( attribute.aIsUp );
		gl.bindBuffer( gl.ARRAY_BUFFER, _buffer );

		// Link attribute
		gl.vertexAttribPointer( attribute.aPosition,     2, gl.FLOAT, false,  5*4, 0   );
		gl.vertexAttribPointer( attribute.aTextureCoord, 2, gl.FLOAT, false,  5*4, 2*4 );
		gl.vertexAttribPointer( attribute.aIsUp,         1, gl.FLOAT, false,  5*4, 4*4 );

		gl.depthMask(false);

		// Binding 3D context
		this.render = RenderCanvas3D;

		_gl = gl;
		_groupId++;
	};


	/**
	 * Unbind 3D Context
	 *
	 * @param {object} gl context
	 */
	SpriteRenderer.unbind = function unBind( gl )
	{
		var attribute = _program.attribute;

		gl.depthMask(true);
		gl.disableVertexAttribArray( attribute.aPosition );
		gl.disableVertexAttribArray( attribute.aTextureCoord );
		gl.disableVertexAttribArray( attribute.aIsUp );
	};


	/**
	 * Prepare to render on 2D context.
	 *
	 * @param {object} ctx canvas context
	 * @param {number} x position
	 * @param {number} y position
	 */
	SpriteRenderer.bind2DContext = function Bind2DContext( ctx, x, y )
	{
		_ctx        = ctx;
		_pos[0]     = x;
		_pos[1]     = y;
		this.render = RenderCanvas2D;
	};


	/**
	 * Render in 3D mode
	 */
	function RenderCanvas3D()
	{
		// Nothing to render ?
		if (!this.image.texture || !this.color[3]) {
			return;
		}

		// gl.uniform* seems to be expensive
		// cache values to avoid flooding the GPU and reducing perf.

		var uniform = _program.uniform;
		var gl      = _gl;
		var use_pal = this.image.palette !== null;

		if (this.shadow !== _shadow) {
			gl.uniform1f( uniform.uShadow, _shadow = this.shadow);
		}
		gl.uniform3fv( uniform.uSpriteRendererPosition, this.position );

		// Palette
		if (use_pal) {
			gl.activeTexture( gl.TEXTURE1 );
			gl.bindTexture( gl.TEXTURE_2D,    this.image.palette );
			gl.uniform2fv( uniform.uTextSize, this.image.size );
			gl.activeTexture( gl.TEXTURE0 );
		}

		if (_usepal !== use_pal) {
			gl.uniform1i(  uniform.uUsePal, _usepal = use_pal );
		}

		// Rotate
		if (this.angle !== _angle) {
			_angle = this.angle;

			mat4.identity(_matrix);
			if (_angle) {
				mat4.rotateZ( _matrix, _matrix, - _angle / 180 * Math.PI );
			}

			gl.uniformMatrix4fv( uniform.uSpriteRendererAngle, false, _matrix );
		}

		gl.uniform4fv( uniform.uSpriteRendererColor,  this.color );
		gl.uniform2fv( uniform.uSpriteRendererSize,   this.size );
		gl.uniform2fv( uniform.uSpriteRendererOffset, this.offset );

		// Avoid binding the new texture 150 times if it's the same.
		if (_groupId !== _lastGroupId || _texture !== this.image.texture) {
			_lastGroupId = _groupId;
			gl.bindTexture( gl.TEXTURE_2D, _texture = this.image.texture );
		}
		gl.drawArrays( gl.TRIANGLE_STRIP, 0, 4 );
	}


	/**
	 * Render in 2D
	 */
	function RenderCanvas2D() {
		this.size[0] *= 35;
		this.size[1] *= 35;

		// Mirror feature
		var scale_x  = 1.0;
		var scale_y  = 1.0;

		if (this.size[0] < 0) {
			scale_x      *= -1;
			this.size[0] *= -1;
		}

		if (this.size[1] < 0) {
			scale_y      *= -1;
			this.size[1] *= -1;
		}


		var _x   = _pos[0] + this.offset[0] * 35;
		var _y   = _pos[1] + this.offset[1] * 35;

		var ctx;
		var pal    = this.palette;
		var canvas = document.createElement("canvas");
		var frame  = this.sprite;
		var width, height, y, x, idx1, idx2;
		var imageData;

		// Nothing to render
		if (frame.width <= 0 || frame.height <= 0) {
			return;
		}

		// Create canvas
		ctx           = canvas.getContext("2d");
		canvas.width  = width  = frame.width;
		canvas.height = height = frame.height;
		imageData     = ctx.createImageData( width, height );

		// RGBA images
		if (this.sprite.type === 1) {
			for (y = 0; y < height; ++y) {
				for (x = 0; x < width; ++x) {
					idx1 = (x + y * width ) * 4;
					imageData.data[ idx1 + 0 ] = frame.data[ idx1 + 0 ] * this.color[0];
					imageData.data[ idx1 + 1 ] = frame.data[ idx1 + 1 ] * this.color[1];
					imageData.data[ idx1 + 2 ] = frame.data[ idx1 + 2 ] * this.color[2];
					imageData.data[ idx1 + 3 ] = frame.data[ idx1 + 3 ] * this.color[3];
				}
			}
		}

		// Palettes
		else {
			for (y = 0; y < height; ++y) {
				for (x = 0; x < width; ++x) {
					if (frame.data[y * width + x]) {
						idx1 = ( y * width + x ) * 4;
						idx2 = frame.data[y * width + x] * 4;
						imageData.data[ idx1 + 0 ] = pal[ idx2 + 0 ] * this.color[0];
						imageData.data[ idx1 + 1 ] = pal[ idx2 + 1 ] * this.color[1];
						imageData.data[ idx1 + 2 ] = pal[ idx2 + 2 ] * this.color[2];
						imageData.data[ idx1 + 3 ] = 255             * this.color[3];
					}
				}
			}
		}

		// Insert into the canvas
		ctx.putImageData( imageData, 0, 0 );

		// Render sprite in context
		_ctx.save();
		_ctx.translate( _x | 0, _y | 0 );
		_ctx.rotate( this.angle / 180 * Math.PI );
		_ctx.scale( scale_x, scale_y );
		_ctx.drawImage(
			 canvas,
			-this.size[0] >> 1, -this.size[1] >> 1,
			 this.size[0]  | 0,  this.size[1]  | 0
		);
		_ctx.restore();
	}


	/**
	 * Export
	 */
	return SpriteRenderer;
});