import Phaser from 'phaser';

/**
 * TouchControls
 * ----------------
 * Self-contained on-screen touch overlay for Phaser scenes.
 * Renders a d-pad (left) and three action buttons (right) sized for a
 * 1024x576 canvas, TMNT arcade-cabinet style.
 *
 * IMPORTANT: The consuming scene MUST call `scene.input.addPointer(3)`
 * (or higher) during its `create()` so Phaser tracks multiple simultaneous
 * touches. Without this, the d-pad thumb + action thumb cannot be pressed
 * at the same time.
 *
 * Usage:
 *   import { TouchControls } from '../ui/TouchControls.js';
 *   // In scene.create():
 *   this.input.addPointer(3);
 *   this.touch = new TouchControls(this);
 *
 *   // In scene.update():
 *   const axis = this.touch.getAxis();      // { x: -1|0|1, y: -1|0|1 }
 *   if (this.touch.isAttackDown()) { ... }
 *   if (this.touch.justPressedJump()) { ... }
 *
 * The overlay uses fixed screen positions (setScrollFactor(0)) and assumes
 * a 1024x576 design resolution. It makes no assumptions about scene scale
 * beyond that; if you use Phaser.Scale.FIT the overlay scales with the
 * rest of the canvas.
 */

const DPAD_CENTER = { x: 130, y: 430 };
const DPAD_BTN_SIZE = 70;   // radius ~35
const DPAD_SPREAD = 70;     // distance from center to each directional button

const ATTACK_POS = { x: 840, y: 430 };
const JUMP_POS = { x: 940, y: 360 };
const SPECIAL_POS = { x: 940, y: 480 };
const ACTION_BTN_SIZE = 80; // radius ~40

const OVERLAY_DEPTH = 10000;
const OVERLAY_ALPHA = 0.5;

const COLORS = {
    dpadFill: 0x222222,
    dpadOutline: 0xffffff,
    attackFill: 0xcc2222,    // red
    jumpFill: 0x2244cc,      // blue
    specialFill: 0xddbb22,   // yellow
    outline: 0xffffff,
    glyph: '#ffffff'
};

export class TouchControls {
    /**
     * @param {Phaser.Scene} scene
     */
    constructor(scene) {
        this.scene = scene;

        // Held state (true while a pointer is on the button)
        this._state = {
            up: false,
            down: false,
            left: false,
            right: false,
            attack: false,
            jump: false,
            special: false
        };

        // Edge-triggered latches; each becomes true for exactly one frame
        // after a fresh press, then is cleared by the postUpdate handler.
        this._justPressed = {
            attack: false,
            jump: false,
            special: false
        };

        // Container holds every visual; easier to hide/destroy as a unit.
        this._container = scene.add.container(0, 0);
        this._container.setDepth(OVERLAY_DEPTH);
        this._container.setScrollFactor(0);

        this._buttons = [];

        this._buildDpad();
        this._buildActionButtons();

        // Clear edge-triggers at the end of every frame.
        this._postUpdate = this._postUpdate.bind(this);
        scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this._postUpdate);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
        scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroy());
    }

    // ---------- public API ----------

    /**
     * @returns {{x:number,y:number}} each component is -1, 0, or 1.
     */
    getAxis() {
        const x = (this._state.right ? 1 : 0) - (this._state.left ? 1 : 0);
        const y = (this._state.down ? 1 : 0) - (this._state.up ? 1 : 0);
        return { x, y };
    }

    isAttackDown()  { return this._state.attack; }
    isJumpDown()    { return this._state.jump; }
    isSpecialDown() { return this._state.special; }

    justPressedAttack()  { return this._justPressed.attack; }
    justPressedJump()    { return this._justPressed.jump; }
    justPressedSpecial() { return this._justPressed.special; }

    /** Show or hide the entire overlay. */
    setVisible(visible) {
        this._container.setVisible(!!visible);
    }

    /** Remove all graphics + listeners. Safe to call more than once. */
    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;

        if (this.scene && this.scene.events) {
            this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this._postUpdate);
        }

        for (const b of this._buttons) {
            if (b.circle) b.circle.removeAllListeners();
        }
        this._buttons = [];

        if (this._container) {
            this._container.destroy();
            this._container = null;
        }
    }

    // ---------- internals ----------

    _postUpdate() {
        // Edge-triggered flags fire for exactly one frame.
        this._justPressed.attack = false;
        this._justPressed.jump = false;
        this._justPressed.special = false;
    }

    _buildDpad() {
        const { x: cx, y: cy } = DPAD_CENTER;
        const r = DPAD_BTN_SIZE / 2;
        const d = DPAD_SPREAD;

        // up, down, left, right
        this._makeButton({
            x: cx,       y: cy - d,  radius: r,
            fillColor: COLORS.dpadFill,
            outlineColor: COLORS.dpadOutline,
            glyph: '▲', // up-pointing triangle
            stateKey: 'up'
        });
        this._makeButton({
            x: cx,       y: cy + d,  radius: r,
            fillColor: COLORS.dpadFill,
            outlineColor: COLORS.dpadOutline,
            glyph: '▼', // down-pointing triangle
            stateKey: 'down'
        });
        this._makeButton({
            x: cx - d,   y: cy,      radius: r,
            fillColor: COLORS.dpadFill,
            outlineColor: COLORS.dpadOutline,
            glyph: '◀', // left-pointing triangle
            stateKey: 'left'
        });
        this._makeButton({
            x: cx + d,   y: cy,      radius: r,
            fillColor: COLORS.dpadFill,
            outlineColor: COLORS.dpadOutline,
            glyph: '▶', // right-pointing triangle
            stateKey: 'right'
        });
    }

    _buildActionButtons() {
        const r = ACTION_BTN_SIZE / 2;

        this._makeButton({
            x: ATTACK_POS.x,  y: ATTACK_POS.y,  radius: r,
            fillColor: COLORS.attackFill,
            outlineColor: COLORS.outline,
            glyph: 'A',
            stateKey: 'attack',
            edgeKey: 'attack'
        });
        this._makeButton({
            x: JUMP_POS.x,    y: JUMP_POS.y,    radius: r,
            fillColor: COLORS.jumpFill,
            outlineColor: COLORS.outline,
            glyph: 'B',
            stateKey: 'jump',
            edgeKey: 'jump'
        });
        this._makeButton({
            x: SPECIAL_POS.x, y: SPECIAL_POS.y, radius: r,
            fillColor: COLORS.specialFill,
            outlineColor: COLORS.outline,
            glyph: 'C',
            stateKey: 'special',
            edgeKey: 'special'
        });
    }

    /**
     * Build one circular button and wire its pointer events to a state key.
     * @private
     */
    _makeButton({ x, y, radius, fillColor, outlineColor, glyph, stateKey, edgeKey }) {
        const scene = this.scene;

        const circle = scene.add.circle(x, y, radius, fillColor, OVERLAY_ALPHA);
        circle.setStrokeStyle(3, outlineColor, 1);
        circle.setScrollFactor(0);
        circle.setDepth(OVERLAY_DEPTH);

        const label = scene.add.text(x, y, glyph, {
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.round(radius * 0.9) + 'px',
            color: COLORS.glyph,
            fontStyle: 'bold'
        }).setOrigin(0.5);
        label.setScrollFactor(0);
        label.setDepth(OVERLAY_DEPTH + 1);

        // Hit area: make it the full circle, not just pixels.
        circle.setInteractive(
            new Phaser.Geom.Circle(radius, radius, radius),
            Phaser.Geom.Circle.Contains
        );

        const press = () => {
            const wasDown = this._state[stateKey];
            this._state[stateKey] = true;
            if (edgeKey && !wasDown) {
                this._justPressed[edgeKey] = true;
            }
        };
        const release = () => {
            this._state[stateKey] = false;
        };

        circle.on('pointerdown', press);
        circle.on('pointerup', release);
        circle.on('pointerout', release);
        circle.on('pointerupoutside', release);

        this._container.add(circle);
        this._container.add(label);
        this._buttons.push({ circle, label, stateKey });
    }
}

export default TouchControls;
