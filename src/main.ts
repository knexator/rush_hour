import * as dat from 'dat.gui';
import Shaku from "shaku/lib/shaku";
import { BlendModes, Vertex, whiteTexture } from "shaku/lib/gfx";
import TextureAsset from "shaku/lib/assets/texture_asset";
import Color from "shaku/lib/utils/color";
import Vector2 from "shaku/lib/utils/vector2";
import Sprite from "shaku/lib/gfx/sprite";
import { gfx, input } from 'shaku';
import Circle from 'shaku/lib/utils/circle';
import { KeyboardKeys } from 'shaku/lib/input/key_codes';
import Animator from 'shaku/lib/utils/animator';

const CONFIG = {
    value_1: 100,
    value_2: 0.6,
};
let gui = new dat.GUI({});
gui.remember(CONFIG);
gui.add(CONFIG, "value_1", 0, 200);
gui.add(CONFIG, "value_2", -1, 1);

// init shaku
await Shaku.init();

// add shaku's canvas to document and set resolution to 800x600
document.body.appendChild(Shaku!.gfx!.canvas);
Shaku.gfx!.setResolution(800, 600, true);
// Shaku.gfx!.centerCanvas();
// Shaku.gfx!.maximizeCanvasSize(false, false);

// Load resources
let cars_texture = await Shaku.assets.loadTexture('imgs/cars.png', null);


// Define game types

type direction = 0 | 1 | 2 | 3;

const DIRS: Record<direction, Vector2> = [
    Vector2.right,
    Vector2.up,
    Vector2.left,
    Vector2.down
];

const DI: Record<direction, number> = [1, 0, -1, 0];
const DJ: Record<direction, number> = [0, 1, 0, -1];

function oppDir(dir: direction): direction {
    return ((2 + dir) % 4) as direction;
}

function rotateDir(dir: direction, by: direction): direction {
    return ((dir + by) % 4) as direction;
}

function localPos(pos: Vector2): boolean {
    return pos.x >= 0 && pos.x < 1 && pos.y >= 0 && pos.y < 1;
}

const TILE_SIZE = 50;
const OFFSET = new Vector2(100, 100);

/** Spatial game data */
class Grid {
    // todo: change this for general grids
    public tiles: Tile[][];
    constructor(
        public w: number,
        public h: number,
    ) {
        this.tiles = makeRectArrayFromFunction<Tile>(w, h, (i, j) => new Tile(i, j, this));
    }

    draw() {
        for (let i = 0; i <= this.w; i++) {
            Shaku.gfx.drawLine(OFFSET.add(i * TILE_SIZE, 0), OFFSET.add(i * TILE_SIZE, this.h * TILE_SIZE), Color.black);
        }
        for (let j = 0; j <= this.h; j++) {
            Shaku.gfx.drawLine(OFFSET.add(0, j * TILE_SIZE), OFFSET.add(this.w * TILE_SIZE, j * TILE_SIZE), Color.black);
        }

        for (let j = 0; j < this.h; j++) {
            for (let i = 0; i < this.w; i++) {
                let tile = this.tiles[j][i];
                if (tile.car !== null) {
                    tile.debugDrawFull(tile.car.color);
                }
            }
        }
    }

    screen2frame(screen_pos: Vector2): Frame | null {
        // todo: change this for general grids
        let pos = screen_pos.sub(OFFSET).divSelf(TILE_SIZE);
        let i = Math.floor(pos.x);
        let j = Math.floor(pos.y);
        if (i < 0 || i >= this.w || j < 0 || j >= this.h) return null;
        return new Frame(this.tiles[j][i], new Vector2(pos.x % 1, pos.y % 1), 0);
    }

    frame2screen(frame: Frame): Vector2 {
        // todo: change this for general grids
        let oriented_frame = frame.clone().redir(0);
        return OFFSET.add(oriented_frame.tile.i * TILE_SIZE, oriented_frame.tile.j * TILE_SIZE).add(oriented_frame.pos.mul(TILE_SIZE));
        // let pos = screen_pos.sub(OFFSET).divSelf(TILE_SIZE);
        // let i = Math.floor(pos.x);
        // let j = Math.floor(pos.y);
        // return new Frame(this.tiles[j][i], new Vector2(pos.x % 1, pos.y % 1), 0);
    }
}

class Tile {
    private sprite: Sprite
    constructor(
        public i: number, // todo: change this for general grids
        public j: number, // todo: change this for general grids
        public grid: Grid,

        // Game logic
        public car: Car | null = null,
    ) {
        this.sprite = new Sprite(whiteTexture);
        this.sprite.static = true;
        let top_left = OFFSET.add(i * TILE_SIZE, j * TILE_SIZE);
        this.sprite._cachedVertices = [
            // @ts-ignore
            new Vertex(top_left, Vector2.zero), // topLeft
            // @ts-ignore
            new Vertex(top_left.add(TILE_SIZE, 0)), // topRight
            // @ts-ignore
            new Vertex(top_left.add(0, TILE_SIZE)), // bottomLeft
            // @ts-ignore
            new Vertex(top_left.add(TILE_SIZE, TILE_SIZE), Vector2.one), // bottomRight
        ]
    }

    adjacent(dir: direction): Tile | null {
        // todo: change this for general grids
        let ni = this.i + DI[dir];
        let nj = this.j + DJ[dir];
        if (ni < 0 || ni >= this.grid.w || nj < 0 || nj >= this.grid.h) return null;
        return this.grid.tiles[nj][ni];
    }

    debugDrawFull(color: Color) {
        this.sprite.color = color;
        Shaku.gfx.drawSprite(this.sprite);
    }
}

/** Frame of reference: position and rotation */
class Frame {
    constructor(
        public tile: Tile,
        /** Both coordinates are in [0, 1) */
        public pos: Vector2,
        /** Relative to the current tile; 90° ccw would be a dir of 1 (since the frame's "right" is the tile's "up" (1)) */
        public dir: direction,
    ) { }

    redir(new_dir: direction): Frame {
        while (this.dir !== new_dir) {
            this.rotccw();
        }
        return this;
    }

    private rotccw(): Frame {
        this.dir = (this.dir + 1) % 4 as direction;
        this.pos.set(
            this.pos.y,
            1.0 - this.pos.x
        )
        return this;
    }

    move(dir: direction, dist: number): Frame | null {
        // all grid logic goes here
        if (dist < 0) {
            return this.move(oppDir(dir), -dist);
        }
        if (dist == 0) return this;
        if (dist > 1) {
            return this.move(dir, 1)?.move(dir, dist - 1) || null;
        }

        let new_pos = this.pos.add(DIRS[dir].mul(dist));
        if (localPos(new_pos)) {
            this.pos = new_pos;
            return this;
        } else {
            // we went out of the tile
            let new_tile = this.tile.adjacent(rotateDir(dir, this.dir));
            if (new_tile === null) return null;

            this.tile = new_tile;
            // go back to a 0..1 position
            this.pos = new_pos.sub(DIRS[dir]);
            if (!localPos(this.pos)) {
                throw new Error("implementation error in Frame.move");
            }
            return this;
        }
    }

    clone() {
        return new Frame(this.tile, this.pos.clone(), this.dir);
    }
}

class Car {
    /** positive offset = the car is moving forwards, in the head.right direction */
    public offset: number;

    private tail: Frame;
    private next: Frame | null;
    private prev: Frame | null;

    constructor(
        /** Car extends from head to head.left */
        public head: Frame,
        public length: number,
        public color: Color,
    ) {
        this.offset = 0;

        let cur_head = head.clone();
        cur_head.tile.car = this;
        for (let k = 1; k < this.length; k++) {
            cur_head.move(2, 1.0);
            cur_head.tile.car = this;
        }
        this.tail = cur_head.clone();
        this.prev = cur_head.move(2, 1.0);
        this.next = head.clone().move(0, 1.0);
    }

    addOffset(delta: number) {
        this.offset += delta;

        // Check movement legality
        if (this.offset > .1 && (this.next === null || this.next.tile.car !== null)) {
            this.offset = .1;
        }
        if (this.offset < -.1 && (this.prev === null || this.prev.tile.car !== null)) {
            this.offset = -.1;
        }

        if (this.offset >= .5) {
            // went forward
            this.offset -= 1;
            this.next!.tile.car = this;
            this.tail.tile.car = null;

            this.prev = this.tail.clone();
            this.tail.move(0, 1.0);
            this.head = this.next!.clone();
            this.next!.move(0, 1.0);
        } else if (this.offset < -.5) {
            // went backward
            this.offset += 1;
            this.prev!.tile.car = this;
            this.head.tile.car = null;

            this.next = this.head.clone();
            this.head.move(2, 1.0);
            this.tail = this.prev!.clone();
            this.prev!.move(2, 1.0);
        }
    }

    draw() {
        /*let visual_head = this.head.clone().move(0, this.offset)!;
        visual_head.tile.debugDrawFull(Color.blue);
        for (let k = 1; k < this.length; k++) {
            visual_head.move(2, 1.0);
            visual_head.tile.debugDrawFull(Color.blue);
        }*/

        let visual_head = this.head.clone().move(0, this.offset)!;
        for (let k = 0; k < this.length; k++) {
            gfx.fillCircle(new Circle(this.grid.frame2screen(visual_head), TILE_SIZE / 3), Color.white);
            // gfx.fillCircle(new Circle(this.grid.frame2screen(visual_head), TILE_SIZE / 3), this.color);
            visual_head.move(2, 1.0);
        }
    }

    get grid(): Grid {
        return this.head.tile.grid;
    }
}

let dragging: {
    car: Car;
    /** 0 if grabbed exactly at head; -1.5 if grabbed exactly at the far end of a 2-sized car */
    total_offset: number;
    // segment: number;
    // offset: number;
} | null = null;

let grid = new Grid(6, 6);

let cars = [
    new Car(new Frame(grid.tiles[2][2], Vector2.one.mulSelf(.5), 0), 2, Color.red),
    new Car(new Frame(grid.tiles[2][5], Vector2.one.mulSelf(.5), 1), 2, Color.green),
    new Car(new Frame(grid.tiles[5][3], Vector2.one.mulSelf(.5), 2), 3, Color.yellow),
]

/*let magic_sprite = new Sprite(cars_texture);
magic_sprite.static = true;
magic_sprite._cachedVertices = [
    // @ts-ignore
    new Vertex(new Vector2(100, 100), Vector2.zero), // topLeft
    // @ts-ignore
    new Vertex(new Vector2(400, 150)), // topRight
    // @ts-ignore
    new Vertex(new Vector2(200, 500)), // bottomLeft
    // @ts-ignore
    new Vertex(new Vector2(500, 450), Vector2.one), // bottomRight
]*/

// do a single main loop step and request the next step
function step() {
    // start a new frame and clear screen
    Shaku.startFrame();
    Shaku.gfx!.clear(Shaku.utils.Color.cornflowerblue);

    // TODO: PUT YOUR GAME UPDATES / RENDERING HERE

    if (dragging === null) {
        if (input.mousePressed()) {
            let grabbed_frame = grid.screen2frame(input.mousePosition);
            if (grabbed_frame !== null && grabbed_frame.tile.car !== null) {
                let car = grabbed_frame.tile.car;
                let segment = 0;
                let car_head = car.head.clone();
                while (car_head.tile != grabbed_frame.tile) {
                    segment++;
                    car_head.move(2, 1.0);
                }
                grabbed_frame.redir(car_head.dir);
                let offset = grabbed_frame.pos.x - .5;

                dragging = {
                    car: car,
                    total_offset: offset - segment,
                }
            }
        }
    } else {
        if (input.mouseReleased()) {
            new Animator(dragging.car).to({ "offset": 0 }).duration(.1).play();
            dragging = null;
        } else {
            let cur_mouse_frame = dragging.car.head.clone().move(0, dragging.car.offset + dragging.total_offset)!;
            let forward = grid.frame2screen(cur_mouse_frame.clone().move(0, .05)!);
            let backward = grid.frame2screen(cur_mouse_frame.clone().move(2, .05)!);
            let delta_vec = forward.sub(backward).normalizeSelf();
            dragging.car.addOffset(Vector2.dot(delta_vec, input.mouseDelta) / TILE_SIZE);

            // dragging.addOffset(4 * Shaku.gameTime.delta * ((input.keyDown(KeyboardKeys.d) ? 1 : 0) - (input.keyDown(KeyboardKeys.a) ? 1 : 0)));
        }
    }

    // Shaku.gfx.drawSprite(magic_sprite);
    grid.draw();

    cars.forEach(c => c.draw());

    // cars[0].offset += .1 * Shaku.gameTime.delta;

    // end frame and request next step
    Shaku.endFrame();
    Shaku.requestAnimationFrame(step);
}

let hola = Shaku!.gfx!.canvas;
console.log(hola);

// console.log(Shaku)

// start main loop
step();


async function loadAsciiTexture(ascii: string, colors: (string | Color)[]): Promise<TextureAsset> {

    let rows = ascii.trim().split("\n").map(x => x.trim())
    console.log(rows)
    let height = rows.length
    let width = rows[0].length

    // create render target
    // @ts-ignore
    let renderTarget = await Shaku.assets.createRenderTarget(null, width, height, 4);

    // use render target
    Shaku.gfx!.setRenderTarget(renderTarget, false);

    for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
            let val = rows[j][i];
            if (val === '.' || val === ' ') continue;
            let n = parseInt(val);

            let col = colors[n];
            if (typeof col === 'string') {
                col = Shaku.utils.Color.fromHex(col);
            }
            Shaku.gfx!.fillRect(
                new Shaku.utils.Rectangle(i, height - j - 1, 1, 1),
                col,
                BlendModes.Opaque, 0
            );
        }
    }

    // reset render target
    // @ts-ignore
    Shaku.gfx!.setRenderTarget(null, false);

    return renderTarget;
}

function makeRectArray<T>(width: number, height: number, fill: T): T[][] {
    let result: T[][] = [];
    for (let j = 0; j < height; j++) {
        let cur_row: T[] = [];
        for (let i = 0; i < width; i++) {
            cur_row.push(fill);
        }
        result.push(cur_row);
    }
    return result;
}

function makeRectArrayFromFunction<T>(width: number, height: number, fill: (i: number, j: number) => T): T[][] {
    let result: T[][] = [];
    for (let j = 0; j < height; j++) {
        let cur_row: T[] = [];
        for (let i = 0; i < width; i++) {
            cur_row.push(fill(i, j));
        }
        result.push(cur_row);
    }
    return result;
}
