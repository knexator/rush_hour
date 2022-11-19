import Effect from "shaku/lib/gfx/effects/effect";
import { BasicEffect } from "shaku/lib/gfx";
import Vector2 from "shaku/lib/utils/vector2";

export const TEXTURE_TILE = 120;
export const N_TILES_X = 5;
export const N_TILES_Y = 3;

export class BackgroundEffect extends BasicEffect {
    get vertexCode(): string {
        return `
        attribute vec3 position;
        attribute vec2 coord;
        
        uniform mat4 projection;
        uniform mat4 world;
        
        varying vec2 v_texCoord;
        varying vec4 v_color;
        
        void main(void) {
            gl_Position = projection * world * vec4(position, 1.0);
            gl_PointSize = 1.0;
            // 1 pixel margin around the square
            v_texCoord = coord * vec2(1. / 5., 1. / 3.);
            // v_texCoord = vec2(${1 / (TEXTURE_TILE * N_TILES_X)}, ${1 / (TEXTURE_TILE * N_TILES_Y)}) + coord.x * ${(TEXTURE_TILE - 2) / (TEXTURE_TILE * N_TILES_X)} + coord.y * ${(TEXTURE_TILE - 2) / (TEXTURE_TILE * N_TILES_Y)};
            v_color = vec4(1.0,1.0,1.0,1.0);
        }`;
    }

    // @ts-ignore
    get attributeTypes() {
        return {
            "position": { size: 3, type: Effect.AttributeTypes.Float, normalize: false, bind: Effect.AttributeBinds.Position },
            "coord": { size: 2, type: Effect.AttributeTypes.Float, normalize: false, bind: Effect.AttributeBinds.TextureCoords },
        };
    }
}

export class CarEffect extends BasicEffect {
    get vertexCode(): string {
        return `attribute vec3 position;
        attribute vec2 coord;
        attribute vec4 color;
        
        uniform mat4 projection;
        uniform mat4 world;
        uniform vec2 uv_pos;
        uniform vec2 uv_col_u;
        uniform vec2 uv_col_v;
        
        varying vec2 v_texCoord;
        varying vec4 v_color;
        
        void main(void) {
            gl_Position = projection * world * vec4(position, 1.0);
            gl_PointSize = 1.0;
            v_texCoord = uv_pos + coord.x * uv_col_u + coord.y * uv_col_v;
            v_color = color;
        }`;
    }

    get fragmentCode(): string {
        return `
        #ifdef GL_ES
            precision highp float;
        #endif
        uniform sampler2D texture;

        uniform vec3 color_high;
        uniform vec3 color_mid;
        uniform vec3 color_low;

        varying vec2 v_texCoord;
        varying vec4 v_color;
        
        void main(void) {
            vec4 lookup = texture2D(texture, v_texCoord);
            vec2 normal = lookup.xy * 2.0 - 1.0;
            vec2 screen_normal = v_color.xy * normal.x - v_color.zw * normal.y;
            float light = dot(screen_normal, vec2(-0.70710678118, -0.70710678118));
            vec3 color = vec3(0.0);
            if (light >= 0.0) {
                // color = mix(vec3(0.416,0.753,0.741), vec3(0.62,0.906,0.843), light);
                color = mix(color_mid, color_high, smoothstep(.20, .40, light));
            } else {
                // color = mix(vec3(0.345,0.537,0.635), vec3(0.416,0.753,0.741), light + 1.0);
                color = mix(color_low, color_mid, smoothstep(.45, .65, light + 1.0));
            }

            gl_FragColor = vec4(color, lookup.a);
            gl_FragColor.rgb *= lookup.a;

            // gl_FragColor = vec4(v_color.xy, 0.0, 1.0);
            // gl_FragColor = vec4(v_color.xy * normal.x + v_color.zw * normal.y, 0.0, 1.0);
            // gl_FragColor = texture2D(texture, v_texCoord) * v_color;
            // gl_FragColor.rgb *= gl_FragColor.a;
            // gl_FragColor = vec4(v_color.xy * v_texCoord.xy, 0.0, 1.0);
        }`;
    }

    get uniformTypes() {
        let ret = super.uniformTypes;
        // @ts-ignore
        ret['uv_pos'] = { type: Effect.UniformTypes.Float2 };
        // @ts-ignore
        ret['uv_col_u'] = { type: Effect.UniformTypes.Float2 };
        // @ts-ignore
        ret['uv_col_v'] = { type: Effect.UniformTypes.Float2 };
        // @ts-ignore
        ret['color_high'] = { type: Effect.UniformTypes.Float3 };
        // @ts-ignore
        ret['color_mid'] = { type: Effect.UniformTypes.Float3 };
        // @ts-ignore
        ret['color_low'] = { type: Effect.UniformTypes.Float3 };
        return ret;
    }
}

