/*
 * Copyright (c) 2013-2015, The SeedStack authors <http://seedstack.org>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
define([
        'module',
        'jquery',
        '{lodash}/lodash',
        '{angular}/angular',
        '{d3}/d3',

        '[text]!{batch}/templates/showStatus.html',
        '[text]!{batch}/templates/showHistory.html',
        '[text]!{batch}/templates/batch-tree.html',
        '[text]!{batch}/templates/breadcrumb.html',

        '{w20-core}/modules/notifications',

        '{w20-dataviz}/modules/charts/discretebar',
        '{w20-dataviz}/modules/charts/pie',

        '{w20-monitoring-addon}/modules/batch'
    ],
    function(_module, $, _, angular,  d3, showStatusTemplate, showHistoryTemplate, batchTreeTemplate, breadcrumbTemplate) {
        'use strict';

        var module = angular.module('batchDirectives', [ 'ngResource' ]);

        // Topbar breadcrumb
        module.directive('breadcrumb', ['$location', '$routeParams', function($location, $routeParams) {
            return {
                restrict: 'A',
                template: breadcrumbTemplate,
                link: function(scope) {
                    scope.showBack = $routeParams.jobName ? true : false;
                    scope.jobName = $routeParams.jobName;
                    scope.jobExecutionId = $routeParams.jobExecutionId;
                    scope.goBack = function () {
                        if ($routeParams.jobName && $routeParams.jobExecutionId) {
                            $location.path('/w20-monitoring-addon/jobs-list/' + $routeParams.jobName);
                        } else if ($routeParams.jobName) {
                            $location.path('/w20-monitoring-addon/jobs-list/');
                        }
                    }
                }
            };
        }]);

        // Expand item by adding the class 'expand' and resize grids since it doesn't detect dimensions changes
        module.directive('expandItem', ['$timeout', '$window', function($timeout){
            return {
                restrict: 'A',
                scope: {
                    resizeGrids: '=exec',
                    updateSteps: '=updateSteps'
                },
                template: '<button class="btn btn-default btn-xs btn-expand pull-right" data-ng-click="expand()"><i class="fa fa-expand"></i></button>',
                replace: true,
                link: function(scope, iElm, iAttrs) {
                    scope.expand = function() {
                        var toExpand = angular.element('#' + iAttrs.itemId);
                        toExpand.toggleClass('expanded');
                        $timeout(function() {
                            scope.resizeGrids();
                        });

                    };
                }
            };
        }]);

        module.directive('batchMap', ['BatchMonitorService', 'NotificationService', function(batchMonitorService, notifier) {
            var m = [20, 50, 20, 80],
                w = 1280 - m[1] - m[3],
                h = 695 - m[0] - m[2],
                i = 0,
                root;

            var tree = d3.layout.tree()
                .size([h, w]);

            var diagonal = d3.svg.diagonal()
                .projection(function(d) { return [d.y, d.x]; });

            return {
                restrict: 'A',
                template: batchTreeTemplate,
                link: function(scope, iElm, iAttrs) {

                    function drawRepresentation(batchData) {
                        d3.select('.batch-map-diagram svg').remove();

                        var vis = d3.select('.' + iAttrs.class).append('svg:svg')
                            .attr('width', w + m[1] + m[3])
                            .attr('height', h + m[0] + m[2])
                            .append('svg:g')
                            .attr('transform', 'translate(' + m[3] + ',' + m[0] + ')');

                        root = batchData;
                        root.x0 = h / 2;
                        root.y0 = 0;

                        // Initialize the display to show the entire tree
                        root.children.forEach(toggleAll);

                        scope.toggleAll = function() {
                            angular.forEach(root.children, function(val, index) {
                                toggle(root.children[index]);
                            });
                            update(root);
                        };

                        scope.toggleAll();

                        scope.completed = true;
                        scope.unknown = true;
                        scope.failed = true;
                        scope.searchBatch = '';

                        scope.$watchCollection('[completed, unknown, failed, searchBatch]', function() {
                            toggleFilter();
                        });

                        function toggleFilter() {
                            root.children.forEach(toggleAll);
                            angular.forEach(root.children, function(val, index) {
                                if (scope.completed && val.status === 'COMPLETED') {
                                    toggle(root.children[index]);
                                }
                                if (scope.unknown && (val.status === 'UNKNOWN' || val.status === 'STARTED' || !val.status) ) {
                                    toggle(root.children[index]);
                                }
                                if (scope.failed && val.status === 'FAILED') {
                                    toggle(root.children[index]);
                                }
                            });
                            update(root);
                        }

                        function filterByName(data) {
                            if (!scope.searchBatch) {
                                return true;
                            }
                            if (scope.searchBatch && data.name.toLowerCase().indexOf(scope.searchBatch.toLowerCase()) !== -1) {
                                return true;
                            }
                            if (scope.searchBatch && data.parent.name.substring(0,4) === '[id=' && data.parent.name.toLowerCase().indexOf(scope.searchBatch.toLowerCase()) !== -1) {
                                return true;
                            }
                            if (scope.searchBatch && _.some(data.children, function(child) { return child.name.toLowerCase().indexOf(scope.searchBatch.toLowerCase()) !== -1; })) {
                                return true;
                            }

                            return false;
                        }

                        function update(source) {
                            var duration = d3.event && d3.event.altKey ? 5000 : 500;

                            // Compute the new tree layout.
                            var nodes = tree.nodes(root)
                                .filter(function(d) {
                                    if (d.status === 'MAINNODE') {
                                        return d;
                                    }
                                    var filtered = filterByName(d);
                                    if (filtered) {
                                        if (scope.completed && d.status === 'COMPLETED') {
                                            return d;
                                        }
                                        if (scope.unknown && (d.status === 'UNKNOWN' || d.status === 'STARTED' || !d.status) ) {
                                            return d;
                                        }
                                        if (scope.failed && d.status === 'FAILED') {
                                            return d;
                                        }
                                    }
                                })
                                .reverse();

                            // Normalize for fixed-depth.
                            nodes.forEach(function(d) { d.y = d.depth * 180; });

                            // Update the nodes…
                            var node = vis.selectAll('g.node')
                                .data(nodes, function(d) { return d.id || (d.id = ++i); });

                            // Enter any new nodes at the parent's previous position.
                            var nodeEnter = node.enter().append('svg:g')
                                .attr('class', 'node')
                                .attr('transform', function() { return 'translate(' + source.y0 + ',' + source.x0 + ')'; })
                                .on('click', function(d) { toggle(d); update(d); });

                            nodeEnter.append('svg:circle')
                                .attr('r', 1e-6)
                                .style('fill', function(d) { return d._children ? 'lightsteelblue' : '#fff'; })
                                .style('stroke', function(d) {
                                    switch(d.status) {
                                        case 'COMPLETED':
                                             return '#47A447';
                                        case 'FAILED':
                                             return  '#FB5858';
                                        default:
                                            return '#545454';
                                    }
                                });

                            nodeEnter.append('svg:a').attr('xlink:href', function(d) { return d.link; })
                                .append('svg:text').text(function(d) { return d.name; })
                                .attr('x', function(d) { return d.children || d._children ? -10 : 10; })
                                .attr('dy', '.35em')
                                .attr('text-anchor', function(d) { return d.children || d._children ? 'end' : 'start'; })
                                .text(function(d) { return d.name; })
                                .style('fill-opacity', 1e-6);

                            // Transition nodes to their new position.
                            var nodeUpdate = node.transition()
                                .duration(duration)
                                .attr('transform', function(d) { return 'translate(' + d.y + ',' + d.x + ')'; });

                            nodeUpdate.select('circle')
                                .attr('r', 4.5)
                                .style('fill', function(d) { return d._children ? 'lightsteelblue' : '#fff'; });

                            nodeUpdate.select('text')
                                .style('fill-opacity', 1);

                            // Transition exiting nodes to the parent's new position.
                            var nodeExit = node.exit().transition()
                                .duration(duration)
                                .attr('transform', function() { return 'translate(' + source.y + ',' + source.x + ')'; })
                                .remove();

                            nodeExit.select('circle')
                                .attr('r', 1e-6);

                            nodeExit.select('text')
                                .style('fill-opacity', 1e-6);

                            // Update the links…
                            var link = vis.selectAll('path.link')
                                .data(tree.links(nodes).filter(function(d) {
                                    if (d.target.status === 'MAINNODE') {
                                        return d;
                                    }
                                    var filtered = filterByName(d.target);
                                    if (filtered) {
                                        if (scope.completed && d.target.status === 'COMPLETED') {
                                            return d;
                                        }
                                        if (scope.unknown && (d.target.status === 'UNKNOWN' || d.target.status === 'STARTED' || !d.target.status) ) {
                                            return d;
                                        }
                                        if (scope.failed && d.target.status === 'FAILED') {
                                            return d;
                                        }
                                    }
                                }), function(d) { return d.target.id; });

                            // Enter any new links at the parent's previous position.
                            link.enter().insert('svg:path', 'g')
                                .attr('class', 'link')
                                .attr('d', function() {
                                    var o = {x: source.x0, y: source.y0};
                                    return diagonal({source: o, target: o});
                                })
                                .transition()
                                .duration(duration)
                                .attr('d', diagonal);

                            // Transition links to their new position.
                            link.transition()
                                .duration(duration)
                                .attr('d', diagonal);

                            // Transition exiting nodes to the parent's new position.
                            link.exit().transition()
                                .duration(duration)
                                .attr('d', function() {
                                    var o = {x: source.x, y: source.y};
                                    return diagonal({source: o, target: o});
                                })
                                .remove();

                            // Stash the old positions for transition.
                            nodes.forEach(function(d) {
                                d.x0 = d.x;
                                d.y0 = d.y;
                            });
                        }
                    }

                    //Toggle children.
                    function toggle(d) {
                        if (d.children) {
                            d._children = d.children;
                            d.children = null;
                        } else {
                            d.children = d._children;
                            d._children = null;
                        }
                    }

                    function toggleAll(d) {
                        if (d.children) {
                            d.children.forEach(toggleAll);
                            toggle(d);
                        }
                    }

                    function updateTree(selectedJob) {
                        if (selectedJob) {
                            batchMonitorService.tree.get({jobName: selectedJob},
                                function(diagramData) {
                                    if (diagramData) {
                                        scope.jobNameList = diagramData.jobNameList;
                                        drawRepresentation(diagramData);
                                    }
                                },
                                function() {
                                    notifier.warn('Failed to retrieve data for tree diagram');
                                });
                        }
                    }

                    iAttrs.$observe('job', function (selectedJob) {
                            scope.diagramJob = selectedJob;
                    });

                    // update tree when selecting another job
                    scope.$watch('diagramJob', function() {
                        if (scope.diagramJob) {
                            updateTree(scope.diagramJob);
                        }
                    });

                    // We also need to update the tree according to polling
                    scope.$on('UpdateEvent', function() {
                        if (scope.diagramJob) {
                            updateTree(scope.diagramJob);
                        }
                    });

                }
            };
        }]);

        // When element width changes, evaluate the 'do' attribute (a function to be executed, here 'resizeGrids()'
        module.directive('onResize', [ '$interval', function($interval) {
            return {
                restrict: 'A',
                link: function(scope, element, attrs) {
                    var oldWidth;
                    var oldHeight;
                    var stop = $interval(function() {
                        var width = element.width();
                        var height = element.height();
                        if ((width !== oldWidth) || (height !== oldHeight)) {
                            oldWidth = width;
                            oldHeight = height;
                            scope.$eval(attrs.do);
                        }
                    }, 500);
                    scope.$on('$destroy', function() {
                        if (angular.isDefined(stop)) {
                            $interval.cancel(stop);
                        }
                        stop = undefined;
                    });
                }
            };
        }]);

        // Display the info modal for step details
        module.directive('showStatusModal', [function() {
            return {
                template: showStatusTemplate
            };
        }]);

        // Display the info modal for step history
        module.directive('showHistoryModal', [function() {
            return {
                template: showHistoryTemplate
            };
        }]);

        return {
            angularModules : [ 'batchDirectives' ]
        };
    });
