/*
 * Copyright (c) 2013-2015, The SeedStack authors <http://seedstack.org>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
// Use this module when you want to mock the REST API for backend-less development

define([
        'require',
        'module',
        'jquery',
        '{angular}/angular',
        '{angular-mocks}/angular-mocks'
    ],
    function(require, _module, $, angular) {
        'use strict';

        var module = angular.module('batchMock', [ 'ngMockE2E' ]);

        module.run(['$httpBackend', '$http', function($httpBackend, $http) {

            $http.get(require.toUrl('basic/mocks/batch/jobs.json')).success(function (data) {
                $httpBackend.whenGET(/rest\/jobs\?pageIndex=.*\&pageSize=.*/).respond(data);
            });

            $http.get(require.toUrl('basic/mocks/batch/jobs-tree.json')).success(function (data) {
                $httpBackend.whenGET(/rest\/jobs\/jobs-tree\/.*/).respond(data);
            });

            $http.get(require.toUrl('basic/mocks/batch/job-execution.json')).success(function (data) {
                $httpBackend.whenGET(/rest\/jobs\/.*\/job-executions/).respond(data);
            });

            $http.get(require.toUrl('basic/mocks/batch/steps.json')).success(function (data) {
                $httpBackend.whenGET(/rest\/jobs\/executions\/.+\/steps$/).respond(data);
            });

            $http.get(require.toUrl('basic/mocks/batch/step-detail.json')).success(function (data) {
                $httpBackend.whenGET(/rest\/jobs\/executions\/.*\/steps\/.*$/).respond(data);
            });

            $http.get(require.toUrl('basic/mocks/batch/step-progress.json')).success(function (data) {
                $httpBackend.whenGET(/rest\/jobs\/executions\/.*\/steps\/.*\/progress/).respond(data);
            });

            $httpBackend.whenGET(/html/).passThrough();
            $httpBackend.whenGET(/\.json/).passThrough();
        }]);

        return {
            angularModules : [ 'batchMock' ]
        };
    });

