/*
 * Copyright (c) 2013-2015, The SeedStack authors <http://seedstack.org>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global module: false, grunt: false, process: false */
module.exports = function (grunt) {
    'use strict';

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        clean: [
            'bower_components/**'
        ],
        jshint: {
            all: {
                src: ['modules/**/*.js']
            }
        },
        bower: {
            install: {
                options: {
                    copy: false
                }
            }
        },
        connect: {
            server: {
                options: {
                    port: 8888,
                    base: '.',
                    keepalive: true
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-bower-task');
    grunt.loadNpmTasks('grunt-contrib-connect');
    grunt.loadNpmTasks('grunt-contrib-clean');

    grunt.registerTask('default', ['jshint', 'bower']);
} ;
