/**
 * The intel layer on the globe: one point per geolocated story, coloured by
 * domain and sized by severity, and a ring per country sized by its
 * instability score. Hover shows a card; click selects the item.
 */

import * as Cesium from 'cesium';
import { h, replace, ago, DOMAIN_LABEL } from './dom.js';

const DOMAIN_COLORS = {
  world: '#ff6b6b',
  hazard: '#ffb347',
  cyber: '#b48cff',
  ai: '#3de0c8',
  markets: '#7ec8ff',
};
const BAND_COLORS = {
  critical: '#ff3b5c',
  high: '#fb923c',
  elevated: '#facc15',
  low: '#4ade80',
};
const HOVER_THROTTLE_MS = 70;

export function createIntelGlobeLayer(viewer, { onSelect, onSelectCountry }) {
  const points = new Cesium.CustomDataSource('anysee-intel');
  const rings = new Cesium.CustomDataSource('anysee-instability');
  viewer.dataSources.add(rings);
  viewer.dataSources.add(points);
  const hidden = new Set();
  let showRings = true;

  const hover = h('div', { class: 'ax-root ax-hover', role: 'tooltip' });
  document.body.append(hover);

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  let lastHover = 0;

  function picked(position) {
    const result = viewer.scene.pick(position);
    return result?.id?.anysee ?? null;
  }

  handler.setInputAction((movement) => {
    const now = performance.now();
    if (now - lastHover < HOVER_THROTTLE_MS) return;
    lastHover = now;
    const data = picked(movement.endPosition);
    if (!data) {
      hover.style.display = 'none';
      viewer.scene.canvas.style.cursor = '';
      return;
    }
    viewer.scene.canvas.style.cursor = 'pointer';
    if (data.kind === 'country') {
      replace(
        hover,
        h(
          'div',
          {},
          `${data.row.name} — instability ${data.row.score} (${data.row.band})`,
        ),
        data.row.drivers?.[0]
          ? h('div', { class: 'ax-meta' }, data.row.drivers[0].title)
          : null,
      );
    } else {
      const item = data.item;
      replace(
        hover,
        h('div', {}, item.title),
        h(
          'div',
          { class: 'ax-meta' },
          `${DOMAIN_LABEL[item.domain] ?? item.domain} · sev ${item.severity} · ${item.publisher} · ${ago(item.time)}` +
            (item.geoPrecision !== 'exact'
              ? ` · placed by ${item.geoPrecision}`
              : ''),
        ),
      );
    }
    const rect = viewer.scene.canvas.getBoundingClientRect();
    hover.style.left = `${Math.min(window.innerWidth - 340, rect.left + movement.endPosition.x + 14)}px`;
    hover.style.top = `${rect.top + movement.endPosition.y + 14}px`;
    hover.style.display = 'block';
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction((click) => {
    const data = picked(click.position);
    if (!data) return;
    hover.style.display = 'none';
    if (data.kind === 'country') onSelectCountry?.(data.row);
    else onSelect?.(data.item);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  function render() {
    viewer.scene.requestRender();
  }

  function applyVisibility() {
    for (const entity of points.entities.values) {
      entity.show = !hidden.has(entity.anysee.item.domain);
    }
    rings.show = showRings;
    render();
  }

  function setData({ items = [], instability = [] }) {
    points.entities.suspendEvents();
    rings.entities.suspendEvents();
    points.entities.removeAll();
    rings.entities.removeAll();
    for (const item of items) {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) continue;
      const color = Cesium.Color.fromCssColorString(
        DOMAIN_COLORS[item.domain] ?? '#00e5ff',
      );
      const size = 5 + Math.round((item.severity ?? 0) / 11);
      const entity = points.entities.add({
        position: Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 1500),
        point: {
          pixelSize: size,
          color: color.withAlpha(item.geoPrecision === 'exact' ? 0.95 : 0.75),
          outlineColor:
            item.tier === 'flash'
              ? Cesium.Color.WHITE
              : Cesium.Color.BLACK.withAlpha(0.7),
          outlineWidth: item.tier === 'flash' ? 2 : 1,
          scaleByDistance: new Cesium.NearFarScalar(2e5, 1.6, 2e7, 0.8),
        },
      });
      entity.anysee = { kind: 'item', item };
      entity.show = !hidden.has(item.domain);
    }
    for (const row of instability) {
      if (row.score < 15) continue;
      const color = Cesium.Color.fromCssColorString(
        BAND_COLORS[row.band] ?? '#facc15',
      );
      const radius = 120_000 + row.score * 6_000;
      const entity = rings.entities.add({
        position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          height: 0,
          material: color.withAlpha(0.12),
          outline: true,
          outlineColor: color.withAlpha(0.55),
        },
      });
      entity.anysee = { kind: 'country', row };
    }
    points.entities.resumeEvents();
    rings.entities.resumeEvents();
    applyVisibility();
  }

  return {
    setData,
    setDomainVisible(domain, visible) {
      if (visible) hidden.delete(domain);
      else hidden.add(domain);
      applyVisibility();
    },
    setRingsVisible(visible) {
      showRings = visible;
      applyVisibility();
    },
    setVisible(visible) {
      points.show = visible;
      rings.show = visible && showRings;
      render();
    },
    flyTo(lat, lon, altitude = 2_500_000) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
        duration: 1.8,
      });
    },
    destroy() {
      handler.destroy();
      hover.remove();
      viewer.dataSources.remove(points, true);
      viewer.dataSources.remove(rings, true);
    },
  };
}
