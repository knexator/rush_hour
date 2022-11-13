import Effect from "shaku/lib/gfx/effects/effect";
import { BasicEffect } from "shaku/lib/gfx";

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

    get uniformTypes() {
        let ret = super.uniformTypes;
        // @ts-ignore
        ret['uv_pos'] = { type: Effect.UniformTypes.Float2 };
        // @ts-ignore
        ret['uv_col_u'] = { type: Effect.UniformTypes.Float2 };
        // @ts-ignore
        ret['uv_col_v'] = { type: Effect.UniformTypes.Float2 };
        return ret;
    }
}

