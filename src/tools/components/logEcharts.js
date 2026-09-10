import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent, DataZoomComponent, MarkLineComponent, MarkPointComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

// Includes scroll legends, inside/slider zoom, and the existing incident/MAX markers.
echarts.use([LineChart, TooltipComponent, LegendComponent, GridComponent, DataZoomComponent, MarkLineComponent, MarkPointComponent, CanvasRenderer])

export const init = echarts.init
export const getInstanceByDom = echarts.getInstanceByDom
