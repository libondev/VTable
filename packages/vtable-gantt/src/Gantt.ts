// import themes from './themes';
// import { createRootElement } from './core/tableHelper';
import { Scenegraph } from './scenegraph/scenegraph';
import { Env } from './env';
import type {
  IBarStyle,
  GanttConstructorOptions,
  IGridStyle,
  ITimelineHeaderStyle,
  IMarkLine,
  IBarLabelText,
  IBarLableTextStyle,
  IScrollStyle,
  IFrameStyle,
  ITableColumnsDefine
} from './ts-types';
import type { ListTableConstructorOptions, TYPES } from '@visactor/vtable';
import { ListTable } from '@visactor/vtable';
import { EventManager } from './event/event-manager';
import { StateManager } from './state/state-manager';
import {
  DayTimes,
  generateMarkLine,
  generateTimeLineDate,
  getHorizontalScrollBarSize,
  getVerticalScrollBarSize,
  initOptions,
  syncScrollStateFromTable
} from './gantt-helper';
import { EventTarget } from './event/EventTarget';
import { formatDate, getWeekNumber, parseDateFormat, toBoxArray } from './tools/util';
// import { generateGanttChartColumns } from './gantt-helper';
export function createRootElement(padding: any, className: string = 'vtable'): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute('tabindex', '0');
  element.classList.add(className);
  element.style.outline = 'none';
  element.style.margin = `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`;

  const width = (element.offsetWidth || element.parentElement?.offsetWidth || 1) - 1;
  const height = (element.offsetHeight || element.parentElement?.offsetHeight || 1) - 1;

  element.style.width = (width && `${width - padding.left - padding.right}px`) || '0px';
  element.style.height = (height && `${height - padding.top - padding.bottom}px`) || '0px';

  return element;
}
export class Gantt extends EventTarget {
  options: GanttConstructorOptions;
  container: HTMLElement;
  canvasWidth?: number;
  canvasHeight?: number;
  tableNoFrameWidth: number;
  tableNoFrameHeight: number;
  tableX: number;
  tableY: number;
  scenegraph: Scenegraph;
  stateManager: StateManager;
  eventManager: EventManager;
  // internalProps: IBaseTableProtected;

  headerStyleCache: any;
  bodyStyleCache: any;
  bodyBottomStyleCache: any;
  listTableInstance?: ListTable;

  canvas: HTMLCanvasElement;
  element: HTMLElement;
  resizeLine: HTMLDivElement;
  context: CanvasRenderingContext2D;
  headerRowHeight: number;
  rowHeight: number;
  timelineColWidth: number;
  colWidthPerDay: number; //分配给每日的宽度

  sortedScales: any;
  reverseSortedScales: any;
  headerLevel: number;
  itemCount: number;
  drawHeight: number;
  headerHeight: number;
  gridHeight: number;

  scrollStyle: IScrollStyle;
  timelineHeaderStyle: ITimelineHeaderStyle;
  gridStyle: IGridStyle;
  barStyle: IBarStyle;
  barLabelText: IBarLabelText;
  barLabelStyle: IBarLableTextStyle;
  frameStyle: IFrameStyle;
  pixelRatio: number;

  startDateField: string;
  endDateField: string;
  progressField: string;
  minDate: Date;
  maxDate: Date;
  taskTableWidth: number;
  taskTableColumns: ITableColumnsDefine;
  markLine: IMarkLine[];
  records: any[];
  constructor(container: HTMLElement, options?: GanttConstructorOptions) {
    super();
    this.container = container;
    this.options = options;
    this.headerRowHeight = options?.defaultHeaderRowHeight ?? 40;
    this.rowHeight = options?.defaultRowHeight ?? 40;
    this.timelineColWidth = options?.timelineColWidth ?? 60;
    this.startDateField = options?.startDateField ?? 'startDate';
    this.endDateField = options?.endDateField ?? 'endDate';
    this.progressField = options?.progressField ?? 'progress';
    this.minDate = options?.minDate ? new Date(options?.minDate) : new Date(2024, 1, 1);
    this.maxDate = options?.maxDate ? new Date(options?.maxDate) : new Date(2025, 1, 1);
    this.taskTableWidth = typeof options?.taskTable?.width === 'number' ? options?.taskTable?.width : 100;
    this.taskTableColumns = options?.taskTable?.columns ?? [];
    this.records = options?.records ?? [];
    this.pixelRatio = options?.pixelRatio ?? 1;
    initOptions(this);
    this._sortScales();
    this._generateTimeLineDateMap();
    this.headerLevel = this.sortedScales.length;
    this.element = createRootElement({ top: 0, right: 0, left: 0, bottom: 0 }, 'vtable-gantt');
    this.element.style.top = '0px';
    this.element.style.left = this.taskTableWidth ? `${this.taskTableWidth}px` : '0px';

    this.canvas = document.createElement('canvas');
    this.element.appendChild(this.canvas);
    this.context = this.canvas.getContext('2d')!;
    if (container) {
      (container as HTMLElement).appendChild(this.element);
      this._updateSize();
    } else {
      this._updateSize();
    }
    this._generateListTable();
    this.itemCount = this.records.length;
    this.headerHeight = this.headerRowHeight * this.headerLevel;
    this.drawHeight = Math.min(this.headerHeight + this.rowHeight * this.itemCount, this.tableNoFrameHeight);
    this.gridHeight = this.drawHeight - this.headerHeight;

    this._createResizeLine();
    this.scenegraph = new Scenegraph(this);
    this.stateManager = new StateManager(this);
    this.eventManager = new EventManager(this);

    this.scenegraph.afterCreateSceneGraph();
  }
  renderTaskTable() {
    this.scenegraph.updateNextFrame();
  }
  /**
   * 窗口尺寸发生变化 或者像数比变化
   * @return {void}
   */
  _updateSize(): void {
    let widthP = 0;
    let heightP = 0;

    if (Env.mode === 'browser') {
      const element = this.getElement();
      let widthWithoutPadding = 0;
      let heightWithoutPadding = 0;
      if (element.parentElement) {
        const computedStyle = element.parentElement.style || window.getComputedStyle(element.parentElement); // 兼容性处理
        widthWithoutPadding =
          element.parentElement.offsetWidth -
          parseInt(computedStyle.paddingLeft || '0px', 10) -
          parseInt(computedStyle.paddingRight || '0px', 10);
        heightWithoutPadding =
          element.parentElement.offsetHeight -
          parseInt(computedStyle.paddingTop || '0px', 10) -
          parseInt(computedStyle.paddingBottom || '0px', 20);
      }
      const width1 = (widthWithoutPadding ?? 1) - 1 - this.taskTableWidth;
      const height1 = (heightWithoutPadding ?? 1) - 1;

      element.style.width = (width1 && `${width1}px`) || '0px';
      element.style.height = (height1 && `${height1}px`) || '0px';

      const { canvas } = this;

      widthP = canvas.parentElement?.offsetWidth ?? 1;
      heightP = canvas.parentElement?.offsetHeight ?? 1;

      //style 与 width，height相同
      if (this?.scenegraph?.stage) {
        this.scenegraph.stage.resize(widthP, heightP);
      } else {
        canvas.style.width = '';
        canvas.style.height = '';
        canvas.width = widthP;
        canvas.height = heightP;

        canvas.style.width = `${widthP}px`;
        canvas.style.height = `${heightP}px`;
      }
    } else if (Env.mode === 'node') {
      widthP = this.canvasWidth - 1;
      heightP = this.canvasHeight - 1;
    }
    const width = Math.floor(widthP - getVerticalScrollBarSize(this.scrollStyle));
    const height = Math.floor(heightP - getHorizontalScrollBarSize(this.scrollStyle));

    this.tableNoFrameWidth = widthP;
    this.tableNoFrameHeight = Math.floor(heightP);
    if (this.frameStyle) {
      //考虑表格整体边框的问题
      const lineWidth = this.frameStyle?.borderLineWidth; // toBoxArray(this.frameStyle?.borderLineWidth ?? [null]);
      this.tableX = lineWidth;
      this.tableY = lineWidth;
      this.tableNoFrameWidth = width - lineWidth;

      this.tableNoFrameHeight = height - lineWidth * 2;
    }
  }
  _generateListTable() {
    const listTableOption = this._generateListTableOptions();
    if (this.taskTableColumns.length >= 1) {
      this.listTableInstance = new ListTable(this.container, listTableOption);

      if (this.options?.taskTable?.width === 'auto') {
        this.taskTableWidth = this.listTableInstance.getAllColsWidth() + this.listTableInstance.tableX * 2;
        this.element.style.left = this.taskTableWidth ? `${this.taskTableWidth}px` : '0px';
        this.listTableInstance.setCanvasSize(
          this.taskTableWidth,
          this.tableNoFrameHeight + this.frameStyle.borderLineWidth * 2
        );
        this._updateSize();
      }
    }
  }
  _generateListTableOptions() {
    const listTable_options: ListTableConstructorOptions = {};
    for (const key in this.options) {
      if (key !== 'timelineScales' && key !== 'barStyle' && key !== 'theme') {
        listTable_options[key] = this.options[key];
      }
    }
    listTable_options.columns = this.options.taskTable.columns;
    // lineWidthArr[1] = 0;
    listTable_options.theme = {
      scrollStyle: Object.assign({}, this.scrollStyle, {
        verticalVisible: 'none'
      }),
      headerStyle: {
        bgColor: this.timelineHeaderStyle.backgroundColor
      },
      cellInnerBorder: false,
      frameStyle: Object.assign({}, this.frameStyle, {
        cornerRadius: 0 //[this.frameStyle.cornerRadius, 0, 0, this.frameStyle.cornerRadius]
      })
    };
    listTable_options.canvasWidth = this.taskTableWidth as number;
    listTable_options.canvasHeight = this.canvasHeight ?? this.canvas.height;
    listTable_options.defaultHeaderRowHeight = this.headerRowHeight * this.headerLevel;
    listTable_options.clearDOM = false;
    return listTable_options;
  }
  _createResizeLine() {
    if (this.listTableInstance && this.options.taskTable.width !== 'auto') {
      this.resizeLine = document.createElement('div');
      this.resizeLine.style.position = 'absolute';
      this.resizeLine.style.top = '0px';
      this.resizeLine.style.left = this.taskTableWidth ? `${this.taskTableWidth - 7}px` : '0px';
      this.resizeLine.style.width = '14px';
      this.resizeLine.style.height = '100%';
      this.resizeLine.style.background = '#e1e4e8';
      this.resizeLine.style.zIndex = '100';
      this.resizeLine.style.cursor = 'col-resize';
      this.resizeLine.style.userSelect = 'none';
      this.resizeLine.style.opacity = '0';

      const highlightLine = document.createElement('div');
      highlightLine.style.position = 'absolute';
      highlightLine.style.top = '0px';
      highlightLine.style.left = '7px';
      highlightLine.style.width = '10px';
      highlightLine.style.height = '100%';
      highlightLine.style.background = '#ffcc00';
      highlightLine.style.zIndex = '100';
      highlightLine.style.cursor = 'col-resize';
      highlightLine.style.userSelect = 'none';
      highlightLine.style.pointerEvents = 'none';
      // highlightLine.style.opacity = '0';
      highlightLine.style.transition = 'background-color 0.3s';
      this.resizeLine.appendChild(highlightLine);
      // 添加鼠标悬停时的高亮效果
      this.resizeLine.addEventListener('mouseover', () => {
        highlightLine.style.backgroundColor = '#ffcc00';
        highlightLine.style.opacity = '1';
      });

      // 添加鼠标移出时恢复初始样式
      this.resizeLine.addEventListener('mouseout', () => {
        // highlightLine.style.backgroundColor = '#e1e4e8';
        // highlightLine.style.opacity = '0';
      });
      (this.container as HTMLElement).appendChild(this.resizeLine);
    }
  }
  /**
   * 获取表格创建的DOM根节点
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * 获取创建gantt传入的容器
   */
  getContainer(): HTMLElement {
    return this.element.parentElement;
  }

  _sortScales() {
    const { timelineScales } = this.options;
    if (timelineScales) {
      const sortOrder = ['year', 'quarter', 'month', 'week', 'day'];
      const orderedScales = timelineScales.slice().sort((a, b) => {
        const indexA = sortOrder.indexOf(a.unit);
        const indexB = sortOrder.indexOf(b.unit);
        if (indexA === -1) {
          return 1;
        } else if (indexB === -1) {
          return -1;
        }
        return indexA - indexB;
      });
      const reverseOrderedScales = timelineScales.slice().sort((a, b) => {
        const indexA = sortOrder.indexOf(a.unit);
        const indexB = sortOrder.indexOf(b.unit);
        if (indexA === -1) {
          return 1;
        } else if (indexB === -1) {
          return -1;
        }
        return indexB - indexA;
      });

      this.sortedScales = orderedScales;
      this.reverseSortedScales = reverseOrderedScales;
    }
  }

  _generateTimeLineDateMap() {
    const startDate = new Date(this.minDate);
    const endDate = new Date(this.maxDate);
    let colWidthIncludeDays = 1000000;
    // Iterate over each scale
    for (const scale of this.reverseSortedScales) {
      // Generate the sub-columns for each step within the scale
      const currentDate = new Date(startDate);
      // const timelineDates: any[] = [];
      scale.timelineDates = generateTimeLineDate(currentDate, endDate, scale);
    }

    const firstScale = this.reverseSortedScales[0];
    const { unit, step } = firstScale;
    if (unit === 'day') {
      colWidthIncludeDays = step;
    } else if (unit === 'month') {
      colWidthIncludeDays = 30;
    } else if (unit === 'week') {
      colWidthIncludeDays = 7;
    } else if (unit === 'quarter') {
      colWidthIncludeDays = 90;
    } else if (unit === 'year') {
      colWidthIncludeDays = 365;
    }
    this.colWidthPerDay = this.timelineColWidth / colWidthIncludeDays;
  }
  getAllRowsHeight() {
    return this.headerRowHeight * this.headerLevel + this.itemCount * this.rowHeight;
  }
  getAllColsWidth() {
    return (
      this.colWidthPerDay *
      (Math.ceil(
        Math.abs(new Date(this.maxDate).getTime() - new Date(this.minDate).getTime()) / (1000 * 60 * 60 * 24)
      ) +
        1)
    );
  }

  getAllGridHeight() {
    return this.itemCount * this.rowHeight;
  }

  getFrozenRowsHeight() {
    return this.headerRowHeight * this.headerLevel;
  }

  getRecordByIndex(index: number) {
    if (this.listTableInstance) {
      return this.listTableInstance.getRecordByRowCol(0, index + this.listTableInstance.columnHeaderLevelCount);
    }
    return this.records[index];
  }

  updateRecord(record: any, index: number) {
    this.listTableInstance.updateRecords([record], [index]);
  }
  updateRecordToListTable(record: any, index: number) {
    this.listTableInstance.updateRecords([record], [index]);
  }
  getTaskInfoByTaskListIndex(index: number) {
    const taskRecord = this.getRecordByIndex(index);
    const startDateField = this.startDateField;
    const endDateField = this.endDateField;
    const progressField = this.progressField;
    const startDate = new Date(taskRecord[startDateField]);
    const endDate = new Date(taskRecord[endDateField]);
    const progress = taskRecord[progressField];
    const taskDays = Math.ceil(Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return {
      taskRecord,
      taskDays,
      startDate,
      endDate,
      progress
    };
  }

  updateDateToTaskRecord(updateDateType: 'move' | 'start-move' | 'end-move', days: number, index: number) {
    const taskRecord = this.getRecordByIndex(index);
    const startDateField = this.startDateField;
    const endDateField = this.endDateField;
    const dateFormat = parseDateFormat(taskRecord[startDateField]);
    const startDate = new Date(taskRecord[startDateField]);
    const endDate = new Date(taskRecord[endDateField]);
    if (updateDateType === 'move') {
      const newStartDate = formatDate(new Date(days * DayTimes + startDate.getTime()), dateFormat);
      const newEndDate = formatDate(new Date(days * DayTimes + endDate.getTime()), dateFormat);
      taskRecord[startDateField] = newStartDate;
      taskRecord[endDateField] = newEndDate;
    } else if (updateDateType === 'start-move') {
      const newStartDate = formatDate(new Date(days * DayTimes + startDate.getTime()), dateFormat);
      taskRecord[startDateField] = newStartDate;
    } else if (updateDateType === 'end-move') {
      const newEndDate = formatDate(new Date(days * DayTimes + endDate.getTime()), dateFormat);
      taskRecord[endDateField] = newEndDate;
    }
    this.updateRecordToListTable(taskRecord, index);
  }

  /**
   * 设置像数比
   * @param pixelRatio
   */
  setPixelRatio(pixelRatio: number) {
    this.pixelRatio = pixelRatio;
    this.scenegraph.setPixelRatio(pixelRatio);
  }

  _resize() {
    this._updateSize();
    this.scenegraph.resize();
    this.listTableInstance.setCanvasSize(
      this.taskTableWidth,
      this.tableNoFrameHeight + this.frameStyle.borderLineWidth * 2
    );
  }
}
