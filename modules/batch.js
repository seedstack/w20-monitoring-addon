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
        '[text]!{w20-monitoring-addon}/templates/showStatus.html',
        '{w20-core}/modules/notifications',
        '{w20-dataviz}/modules/charts/discretebar',
        '{w20-dataviz}/modules/charts/pie',
        '{angular-resource}/angular-resource',
        '[css]!{w20-monitoring-addon}/style/style.css'
    ],
    function (_module, $, _, angular, d3) {
        'use strict';

        var _config = _module && _module.config() || {},
            POLLING = 5000, //ms
            module = angular.module('batch', [ 'ngResource', 'ngRoute' ]);

        module.factory('BatchMonitorService', ['$resource', function ($resource) {
            return {
                jobs: $resource(_config.restPrefix + '/jobs'),
                jobExecution: $resource(_config.restPrefix + '/jobs/:jobName/job-executions'),
                jobExecutionStep: $resource(_config.restPrefix + '/jobs/executions/:jobExecutionId/steps'),
                stepDetails: $resource(_config.restPrefix + '/jobs/executions/:jobExecutionId/steps/:stepExecutionId'),
                stepProgress: $resource(_config.restPrefix + '/jobs/executions/:jobExecutionId/steps/:stepExecutionId/progress'),
                tree: $resource(_config.restPrefix + '/jobs/jobs-tree/:jobName')
            };
        }]);

        module.factory('PollingService', function () {
            var _isPolling = false;
            return {
                set: function (bool) {
                    _isPolling = bool;
                },
                isPolling: function () {
                    return _isPolling;
                }
            };
        });

        module.controller('JobsListController',
            [ '$scope', '$log', 'BatchMonitorService', 'NotificationService', '$location', '$timeout', 'PollingService', 'AuthorizationService', 'AuthenticationService',
                function ($scope, $log, batchMonitorService, notifier, $location, $timeout, pollingService, authorizationService, authenticationService) {

                    $scope.authorization = authorizationService;
                    $scope.authentication = authenticationService;

                    function getJobs(callback) {
                        batchMonitorService.jobs.get({
                                searchedJob: $scope.searchQuery,
                                pageSize: $scope.pagingOptionsJob.pageSize,
                                pageIndex: $scope.pagingOptionsJob.currentPage
                            },
                            function (jobs) {
                                if (jobs && jobs.totalItems && jobs.results) {
                                    if (jobs.results.length) {
                                        $scope.jobsList = jobs.results;
                                        $scope.jobsTotalServerItems = jobs.totalItems;

                                        angular.forEach(jobs.results, function (job) {
                                            getJobExecutions(job.name);
                                        });

                                        if (callback && typeof callback === 'function') {
                                            callback();
                                        }

                                    } else {
                                        notifier.alert('jobs list is empty');
                                    }
                                } else {
                                    $log.info('Job resource was correctly called but has empty results');
                                }
                            },
                            function (err) {
                                notifier.alert('An error occurred while retrieving batch jobs. Status : ' + err.status);
                            }
                        );
                    }

                    function getJobExecutions(jobName) {
                        if (jobName) {
                            batchMonitorService.jobExecution.get({jobName: jobName},
                                function (jobExecution) {
                                    if (jobExecution && jobExecution.results && typeof jobExecution.results === 'object') {
                                        updateProgressChart(jobName, jobExecution.results);
                                    }
                                },
                                function () {
                                    notifier.alert('An error occurred while retrieving job execution for job ' + jobName);
                                    $scope.jobExecution = [];
                                });
                        } else {
                            throw new Error('No job name selected');
                        }
                    }

                    function updateProgressChart(jobName, jobExecutions) {
                        if (jobName && jobExecutions) {
                            $scope.chartOverallProgressData[jobName] = {completed: 0, unknown: 0, failed: 0};
                            angular.forEach(jobExecutions, function (jobExec) {
                                if (jobExec && jobExec.exitStatus && jobExec.exitStatus.exitCode) {
                                    switch (jobExec.exitStatus.exitCode) {
                                        case 'COMPLETED':
                                            $scope.chartOverallProgressData[jobName].completed++;
                                            break;
                                        case 'UNKNOWN':
                                            $scope.chartOverallProgressData[jobName].unknown++;
                                            break;
                                        case 'FAILED':
                                            $scope.chartOverallProgressData[jobName].failed++;
                                            break;
                                        default:
                                            break;
                                    }
                                } else {
                                    throw new Error('Data is malformed');
                                }
                            });

                            $scope.pieData[jobName] = [
                                { key: 'Completed', value: $scope.chartOverallProgressData[jobName].completed },
                                { key: 'Unknown', value: $scope.chartOverallProgressData[jobName].unknown },
                                { key: 'Failed', value: $scope.chartOverallProgressData[jobName].failed }
                            ];

                            $scope.pieConfig[jobName] = {
                                data: $scope.pieData[jobName],
                                donut: false,
                                color: ['#5CB85C', '#F5F5F5', '#FB5858'],
                                showLabels: false,
                                interactive: false,
                                pieLabelsOutside: false,
                                showValues: false,
                                tooltips: true,
                                tooltipContent: function (key, y) {
                                    return '<p>' + Math.round(y) + ' ' + key + '</p>';
                                },
                                labelType: 'percent',
                                showLegend: false
                            };
                        } else {
                            throw new Error('No data');
                        }
                    }

                    var stopPoll;

                    function poll() {
                        angular.forEach($scope.jobsList, function (job) {
                            getJobExecutions(job.name);
                        });
                        stopPoll = $timeout(function () {
                            poll();
                        }, POLLING);
                    }

                    $scope.jobsList = [];
                    $scope.selectedJob = [];
                    $scope.jobsTotalServerItems = 0;
                    $scope.chartOverallProgressData = {};
                    $scope.pieConfig = {};
                    $scope.pieData = {};
                    $scope.pagingOptionsJob = { pageSize: 10, currentPage: 1 };


                    $scope.searchJobs = function () {
                        getJobs();
                    };

                    $scope.selectJob = function (job) {
                        $location.path('/w20-monitoring-addon/jobs-list/' + job.name);
                    };

                    try {
                        $scope.isPolling = pollingService.isPolling();
                        $scope.delta = Math.round(POLLING / 1000);

                        // Activate polling
                        $scope.polling = function () {
                            if ($scope.isPolling) {
                                $timeout.cancel(stopPoll);
                                $scope.isPolling = false;
                                pollingService.set($scope.isPolling);
                                return;
                            }
                            $scope.isPolling = true;
                            pollingService.set($scope.isPolling);
                            poll();
                        };

                        if ($scope.isPolling) {
                            getJobs(poll, $scope.searchQuery);
                        } else {
                            getJobs(null, $scope.searchQuery);
                        }

                        $scope.$on('$destroy', function () {
                            $timeout.cancel(stopPoll);
                        });

                    } catch (e) {
                        throw new Error('Could not get jobs list ' + e.message);
                    }
                }]);

        module.controller('JobsInstanceListController',
            [ '$scope', 'BatchMonitorService', 'NotificationService', '$location', '$routeParams', '$timeout', 'PollingService', 'AuthorizationService', 'AuthenticationService',
                function ($scope, batchMonitorService, notifier, $location, $routeParams, $timeout, pollingService, authorizationService, authenticationService) {

                    $scope.authorization = authorizationService;
                    $scope.authentication = authenticationService;

                    function getJobExecutions(jobName, callback) {
                        if (jobName) {
                            batchMonitorService.jobExecution.get({
                                    pageSize: $scope.pagingOptionsJobExecution.pageSize,
                                    pageIndex: $scope.pagingOptionsJobExecution.currentPage,
                                    jobName: jobName
                                },
                                function (jobExecution) {
                                    if (jobExecution) {
                                        if (jobExecution.totalItems && jobExecution.results) {
                                            $scope.jobExecution = jobExecution.results;
                                            $scope.jobsExecutionTotalServerItems = jobExecution.totalItems;

                                            // todo: remove after #19 is fixed
                                            angular.forEach($scope.jobExecution, function (exec) {
                                                exec.startDate = new Date(exec.startDate);
                                            });

                                            graphJobExecution($scope.jobExecution);

                                            if (callback && typeof callback === 'function') {
                                                callback();
                                            }

                                        }
                                    } else {
                                        throw new Error('Could not get any job executions');
                                    }
                                },
                                function () {
                                    notifier.alert('An error occured while retrieving job execution for job ' + $scope.selectedJob.name);
                                    $scope.jobExecution = [];
                                }
                            );
                        } else {
                            throw new Error('No job name');
                        }
                    }

                    function graphJobExecution(jobExecutions) {
                        if (jobExecutions) {
                            $scope.chartJobExecutionProgressData = [];
                            $scope.chartJobExecutionStatus = [];
                            jobExecutions.forEach(function (jobExecution) {
                                if (jobExecution && jobExecution.exitStatus && jobExecution.exitStatus.exitCode) {
                                    // convert to second
                                    var durationArray = jobExecution.duration.split(':');
                                    var durationInSecond = Number(durationArray[0]) * 3600 + Number(durationArray[1]) * 60 + Number(durationArray[2]);
                                    $scope.chartJobExecutionProgressData.push([jobExecution.id, durationInSecond]);
                                }
                                $scope.chartJobExecutionStatus.push(jobExecution.exitStatus.exitCode === 'COMPLETED' ? '#5cb85c' : '#fb2222');
                            });
                            $scope.discreteBarData = [
                                {key: 'Job execution', values: $scope.chartJobExecutionProgressData}
                            ];

                            $scope.discreteBarJobInstanceConfig = {
                                data: $scope.discreteBarData,
                                tooltips: true,
                                showValues: true,
                                staggerLabels: false,
                                color: $scope.chartJobExecutionStatus,
                                valueFormat: d3.format('.d'),
                                yAxisTickFormat: d3.format('.d')
                            };

                        } else {
                            throw new Error('No job executions');
                        }
                    }

                    var stopPoll;

                    function poll() {
                        getJobExecutions($scope.selectedJob);
                        stopPoll = $timeout(function () {
                            poll();
                        }, POLLING);
                    }

                    $scope.jobExecution = [];
                    $scope.selectedJobExecution = [];
                    $scope.jobsExecutionTotalServerItems = 0;
                    $scope.pagingOptionsJobExecution = { pageSize: 10, currentPage: 1 };

                    $scope.changePage = function () {
                        getJobExecutions($scope.selectedJob);
                    };

                    $scope.goToSteps = function (id) {
                        $location.path('/w20-monitoring-addon/jobs-list/' + $scope.selectedJob + '/' + id);
                    };

                    try {
                        $scope.selectedJob = $routeParams.jobName;
                        $scope.delta = Math.round(POLLING / 1000);
                        $scope.isPolling = pollingService.isPolling();

                        // Activate polling
                        $scope.polling = function () {
                            if ($scope.isPolling) {
                                $timeout.cancel(stopPoll);
                                $scope.isPolling = false;
                                pollingService.set($scope.isPolling);
                                return;
                            }
                            $scope.isPolling = true;
                            pollingService.set($scope.isPolling);
                            poll();
                        };

                        getJobExecutions($scope.selectedJob);

                        if ($scope.isPolling) {
                            poll();
                        }

                        $scope.$on('$destroy', function () {
                            $timeout.cancel(stopPoll);
                        });

                    } catch (e) {
                        throw new Error('Could not get the associated job ' + e.message);
                    }

                }
            ]);

        module.controller('StepDetailsController',
            [ '$scope', 'BatchMonitorService', 'NotificationService', '$routeParams', '$timeout', 'PollingService', 'AuthorizationService', 'AuthenticationService',
                function ($scope, batchMonitorService, notifier, $routeParams, $timeout, pollingService, authorizationService, authenticationService) {

                    $scope.authorization = authorizationService;
                    $scope.authentication = authenticationService;
                    $scope.steps = [];
                    $scope.selectedStep = [];
                    $scope.progressSteps = [];
                    $scope.stepExecutionProgress = [];
                    $scope.chartStepsProgressData = [];


                    function getSteps(jobExecutionId) {
                        batchMonitorService.jobExecutionStep.query({jobExecutionId: jobExecutionId},
                            function (steps) {
                                if (steps) {
                                    $scope.steps = steps;
                                    graphSteps($scope.steps);
                                    angular.forEach($scope.steps, function (step, index) {
                                        getStepDetails(jobExecutionId, step.id, index);
                                        getHistory(jobExecutionId, step.id, index);
                                    });
                                }
                            },
                            function () {
                                notifier.alert('An error occured while retrieving job steps for job ' + $scope.selectedJob.name);
                                $scope.steps = [];
                            }
                        );
                    }

                    function getStepDetails(jobExecutionId, stepExecutionId, index) {
                        batchMonitorService.stepDetails.get({jobExecutionId: jobExecutionId, stepExecutionId: stepExecutionId},
                            function (stepDetails) {
                                if (stepDetails && stepDetails.stepExecutionDetailsRepresentation) {
                                    $scope.steps[index].details = formatDetailsStepExecution(stepDetails.stepExecutionDetailsRepresentation);
                                    updateAnnoucements(index, $scope.steps[index].details);
                                }
                            },
                            function (err) {
                                notifier.alert('An error occured while retrieving job steps details for job ' + err.message);
                                $scope.steps = [];
                            }
                        );

                    }

                    function formatStepHistory(stepExecutionHistory) {
                        var array = [],
                            currentRow;
                        for (var key in stepExecutionHistory) {
                            if (stepExecutionHistory.hasOwnProperty(key)) {
                                currentRow = stepExecutionHistory[key];
                                if ((key !== 'count') && (key !== 'stepName')) {
                                    array.push({property: key,
                                        count: currentRow.count,
                                        min: currentRow.min,
                                        max: currentRow.max,
                                        mean: Math.round(currentRow.mean * 100) / 100,
                                        sigma: Math.round(currentRow.standardDeviation * 100) / 100});
                                }
                            }
                        }
                        return array;
                    }

                    function getHistory(jobExecutionId, stepExecutionId, index) {
                        batchMonitorService.stepProgress.get({jobExecutionId: jobExecutionId, stepExecutionId: stepExecutionId},
                            function (stepProgress) {
                                if (stepProgress) {
                                    $scope.steps[index].stepExecutionProgress = stepProgress;
                                    if (stepProgress.stepExecutionHistory) {
                                        $scope.steps[index].historySteps = formatStepHistory(stepProgress.stepExecutionHistory);
                                    }
                                }
                            },
                            function () {
                                notifier.alert('An error occured while retrieving job steps progress for job');
                                $scope.steps = [];
                            }
                        );
                    }

                    function updateAnnoucements(index, stepDetails) {
                        $scope.steps[index].announcements = [
                            {icon: 'fa-book', text: 'Read count', val: ''},
                            {icon: 'fa-pencil', text: 'Write count', val: ''},
                            {icon: 'fa-check', text: 'Commit count', val: ''},
                            {icon: 'fa-times', text: 'Rollback count', val: ''}
                        ];

                        angular.forEach(stepDetails, function (detail) {
                            if (detail.property === 'readCount') {
                                $scope.steps[index].announcements[0].val = detail.value;
                            }
                            if (detail.property === 'writeCount') {
                                $scope.steps[index].announcements[1].val = detail.value;
                            }
                            if (detail.property === 'commitCount') {
                                $scope.steps[index].announcements[2].val = detail.value;
                            }
                            if (detail.property === 'rollbackCount') {
                                $scope.steps[index].announcements[3].val = detail.value;
                            }
                            $scope.steps[index].announcements = _.uniq($scope.steps[index].announcements);
                        });
                    }

                    $scope.showFullDetails = function (stepId) {
                        angular.element('#showDetails' + stepId).modal();
                    };

                    $scope.showHistory = function (stepId) {
                        angular.element('#showHistory' + stepId).modal();
                    };

                    function graphSteps(steps) {
                        if (steps) {
                            $scope.chartStepsProgressData = [];
                            $scope.chartStepStatus = [];
                            steps.forEach(function (step) {
                                if (step && step.name) {
                                    $scope.chartStepsProgressData.push([step.name, step.durationMillis]);
                                }
                                $scope.chartStepStatus.push(step.status === 'COMPLETED' ? '#5cb85c' : '#fb2222');
                            });
                            $scope.discreteBarData = [
                                {key: 'Batch steps', values: $scope.chartStepsProgressData}
                            ];
                            $scope.discreteBarConfig = {
                                data: $scope.discreteBarData,
                                tooltips: true,
                                showValues: true,
                                staggerLabels: true,
                                color: $scope.chartStepStatus,
                                valueFormat: d3.format('.d'),
                                yAxisTickFormat: d3.format('.d')
                            };
                        } else {
                            throw new Error('No steps');
                        }
                    }

                    function formatDetailsStepExecution(stepExecutionDetailsRepresentaion) {
                        var array = [];
                        for (var key in stepExecutionDetailsRepresentaion) {
                            if (stepExecutionDetailsRepresentaion.hasOwnProperty(key)) {
                                if ((key !== 'executionContext') && (key !== 'failureExceptions')) {
                                    array.push({property: key, value: stepExecutionDetailsRepresentaion[key]});
                                }
                            }
                        }
                        return array;
                    }

                    var stopPoll;

                    function poll() {
                        getSteps($scope.selectedJobExecutionId);
                        stopPoll = $timeout(function () {
                            poll();
                        }, POLLING);
                    }

                    try {
                        $scope.selectedJob = $routeParams.jobName;
                        $scope.selectedJobExecutionId = $routeParams.jobExecutionId;
                        $scope.delta = Math.round(POLLING / 1000);
                        $scope.isPolling = pollingService.isPolling();

                        // Activate polling
                        $scope.polling = function () {
                            if ($scope.isPolling) {
                                $timeout.cancel(stopPoll);
                                $scope.isPolling = false;
                                pollingService.set($scope.isPolling);
                                return;
                            }
                            $scope.isPolling = true;
                            pollingService.set($scope.isPolling);
                            poll();
                        };

                        getSteps($scope.selectedJobExecutionId);

                        if ($scope.isPolling) {
                            poll();
                        }

                        $scope.$on('$destroy', function () {
                            $timeout.cancel(stopPoll);
                        });

                        $scope.$watch('steps', function () {}, true);

                    } catch (e) {
                        throw new Error('Could not get the associated job execution ' + e.message);
                    }
                }
            ]);

        return {
            angularModules: [ 'batch' ]
        };
    });